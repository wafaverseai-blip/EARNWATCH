// Common frontend logic: auth, balance display, user info
const api = {
  async call(endpoint, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(endpoint, opts);
    return res.json();
  },
  async getUser() {
    const res = await this.call('/api/user');
    return res.user || null;
  },
  async getBalance() {
    const res = await this.call('/api/balance');
    return res.balance || 0;
  }
};

function updateUI(user) {
  const infoSpan = document.getElementById('user-info');
  const authSection = document.getElementById('auth-section');
  const dashboard = document.getElementById('dashboard');
  const balanceSpan = document.getElementById('balance');
  const earnBalanceSpan = document.getElementById('balance'); // same id used on earn page

  if (user) {
    infoSpan.textContent = `${user.email} (Balance: ₹${user.balance})`;
    if (authSection) authSection.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    if (balanceSpan) balanceSpan.textContent = user.balance.toFixed(2);
    if (earnBalanceSpan) earnBalanceSpan.textContent = user.balance.toFixed(2);
  } else {
    infoSpan.textContent = 'Not logged in';
    if (authSection) {
      authSection.style.display = 'block';
      authSection.innerHTML = `
        <h3>Login / Register</h3>
        <input type="email" id="email" placeholder="Email" value="test@example.com">
        <input type="password" id="password" placeholder="Password" value="password123">
        <button id="login-btn">Login</button>
        <button id="register-btn">Register</button>
      `;
      document.getElementById('login-btn').addEventListener('click', login);
      document.getElementById('register-btn').addEventListener('click', register);
    }
    if (dashboard) dashboard.style.display = 'none';
  }
}

async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const res = await api.call('/api/login', 'POST', { email, password });
  if (res.success) location.reload();
  else alert(res.error);
}

async function register() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const res = await api.call('/api/register', 'POST', { email, password });
  if (res.success) location.reload();
  else alert(res.error);
}

async function logout() {
  await api.call('/api/logout', 'POST');
  location.reload();
}

// Initialize
(async () => {
  const user = await api.getUser();
  updateUI(user);
})();

// Earn page specific
if (window.location.pathname.includes('earn.html')) {
  let currentTaskId = null;
  let timerInterval = null;
  let secondsLeft = 30;
  const video = document.getElementById('ad-video');
  const watchBtn = document.getElementById('watch-btn');
  const timerDisplay = document.getElementById('timer-display');
  const adStatus = document.getElementById('ad-status');

  async function loadAd() {
    adStatus.textContent = 'Loading ad...';
    watchBtn.disabled = true;
    const res = await api.call('/api/task');
    if (res.success) {
      currentTaskId = res.taskId;
      video.src = res.videoUrl;
      video.load();
      adStatus.textContent = 'Ad loaded. Press play.';
    } else {
      adStatus.textContent = 'No ads available. Try later.';
    }
  }

  video.addEventListener('play', () => {
    // Start timer only if video is playing
    if (timerInterval) clearInterval(timerInterval);
    secondsLeft = 30;
    timerDisplay.textContent = `00:${secondsLeft}`;
    timerInterval = setInterval(() => {
      secondsLeft--;
      timerDisplay.textContent = `00:${secondsLeft < 10 ? '0' + secondsLeft : secondsLeft}`;
      if (secondsLeft <= 0) {
        clearInterval(timerInterval);
        timerDisplay.textContent = 'Done!';
        watchBtn.disabled = false;
      }
    }, 1000);
  });

  video.addEventListener('pause', () => {
    if (timerInterval) clearInterval(timerInterval);
    timerDisplay.textContent = '00:30';
  });

  video.addEventListener('ended', () => {
    if (timerInterval) clearInterval(timerInterval);
    timerDisplay.textContent = '00:00';
    watchBtn.disabled = false;
  });

  watchBtn.addEventListener('click', async () => {
    if (!currentTaskId || secondsLeft > 0) return;
    watchBtn.disabled = true;
    const res = await api.call('/api/task', 'POST', { taskId: currentTaskId });
    if (res.success) {
      alert('₹1 added to your balance!');
      const user = await api.getUser();
      updateUI(user);
      loadAd();
    } else {
      alert(res.error || 'Failed to credit');
    }
  });

  document.getElementById('withdraw-btn').addEventListener('click', () => {
    document.getElementById('withdraw-form').style.display = 'block';
  });

  document.getElementById('request-withdraw').addEventListener('click', async () => {
    const upi = document.getElementById('upi-id').value;
    const amount = parseFloat(document.getElementById('amount').value);
    if (!upi || !amount) return alert('Fill all fields');
    const res = await api.call('/api/withdraw', 'POST', { upiId: upi, amount });
    if (res.success) alert('Withdrawal request submitted');
    else alert(res.error);
    document.getElementById('withdraw-form').style.display = 'none';
  });

  loadAd();
}

// Advertise page
if (window.location.pathname.includes('advertise.html')) {
  // Razorpay integration and campaign creation
  const form = document.getElementById('create-ad-form');
  const budgetInput = document.getElementById('ad-budget');
  const viewsSpan = document.getElementById('estimated-views');
  budgetInput.addEventListener('input', () => {
    const budget = parseFloat(budgetInput.value) || 0;
    viewsSpan.textContent = Math.floor(budget / 2);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('ad-title').value;
    const videoUrl = document.getElementById('ad-video-url').value;
    const budget = parseFloat(budgetInput.value);
    
    // Create Razorpay order
    const orderRes = await api.call('/api/payment', 'POST', { amount: budget });
    if (!orderRes.success) return alert(orderRes.error);

    const options = {
      key: orderRes.keyId,
      amount: orderRes.amount,
      currency: 'INR',
      name: 'EarnWatch',
      description: `Ad Campaign: ${title}`,
      order_id: orderRes.orderId,
      handler: async function(response) {
        // Verify payment
        const verifyRes = await api.call('/api/payment-verify', 'POST', {
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          adTitle: title,
          videoUrl: videoUrl,
          budget: budget
        });
        if (verifyRes.success) {
          alert('Payment successful! Ad campaign created.');
          form.reset();
          loadCampaigns();
        } else {
          alert('Payment verification failed');
        }
      },
      prefill: { email: (await api.getUser()).email },
      theme: { color: '#0066cc' }
    };
    const rzp = new Razorpay(options);
    rzp.open();
  });

  async function loadCampaigns() {
    const res = await api.call('/api/ads');
    const listDiv = document.getElementById('campaign-list');
    if (res.ads && res.ads.length) {
      listDiv.innerHTML = '<h3>Your Campaigns</h3>' + res.ads.map(ad => 
        `<div>${ad.title} – Views: ${ad.views_served}/${ad.target_views} (Budget: ₹${ad.budget})</div>`
      ).join('');
    }
  }

  // Show form only if logged in as advertiser (role check)
  (async () => {
    const user = await api.getUser();
    if (user && user.role === 'advertiser') {
      document.getElementById('advertiser-login-msg').style.display = 'none';
      form.style.display = 'block';
      loadCampaigns();
    } else {
      document.getElementById('advertiser-login-msg').textContent = 'Please log in as an advertiser.';
    }
  })();
}
