// Admin Panel JavaScript - TicTacToe OX
let API_URL = '';
let ADMIN_PASSWORD = '';
let currentSection = 'dashboard';
let allUsers = [];
let allGames = [];

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Set default API URL
    document.getElementById('apiUrl').value = 'https://tictactoe-ox-backend-production.up.railway.app';
    
    // Login button
    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('adminPassword').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const section = this.getAttribute('data-section');
            showSection(section, this);
        });
    });
    
    // User search
    document.getElementById('searchUsersBtn').addEventListener('click', searchUsers);
    document.getElementById('userSearch').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchUsers();
    });
    
    // Add balance
    document.getElementById('addBalanceBtn').addEventListener('click', addBalance);
    
    // Filter games
    document.getElementById('filterGamesBtn').addEventListener('click', filterGames);
    
    // Modal close
    document.getElementById('closeModalBtn').addEventListener('click', closeModal);
    document.getElementById('userModal').addEventListener('click', function(e) {
        if (e.target === this) closeModal();
    });
    
    // Save user
    document.getElementById('saveUserBtn').addEventListener('click', saveUser);
    
    // Settings
    document.getElementById('updatePasswordBtn').addEventListener('click', updateAdminPassword);
    document.getElementById('broadcastBtn').addEventListener('click', broadcastMessage);
});

// Login
async function login() {
    API_URL = document.getElementById('apiUrl').value;
    ADMIN_PASSWORD = document.getElementById('adminPassword').value;
    
    if (!ADMIN_PASSWORD) {
        alert('Inserisci la password admin');
        return;
    }
    
    try {
        const res = await fetch(API_URL + '/api/admin/dashboard', {
            headers: { 'x-admin-password': ADMIN_PASSWORD }
        });
        
        if (res.ok) {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('mainApp').style.display = 'block';
            loadDashboard();
        } else {
            alert('Password admin non valida!');
        }
    } catch (e) {
        alert('Errore connessione: ' + e.message);
    }
}

// Load Dashboard
async function loadDashboard() {
    try {
        const res = await fetch(API_URL + '/api/admin/dashboard', {
            headers: { 'x-admin-password': ADMIN_PASSWORD }
        });
        const data = await res.json();
        const stats = data.stats; // API returns { success, stats: {...} }
        
        document.getElementById('totalUsers').textContent = stats.users.total;
        document.getElementById('newUsers').textContent = stats.users.newLast24h;
        document.getElementById('totalGames').textContent = stats.games.total;
        document.getElementById('activeGames').textContent = stats.games.active;
        document.getElementById('totalFun').textContent = stats.balances.totalFun.toLocaleString();
        document.getElementById('totalReal').textContent = '€' + stats.balances.totalReal.toLocaleString();
        document.getElementById('walletBalance').textContent = stats.wallet.balanceSats.toLocaleString() + ' sats';
        document.getElementById('totalDeposits').textContent = stats.deposits;
        
        // Games by status
        let statusHtml = '';
        if (stats.games.byStatus && stats.games.byStatus.length > 0) {
            stats.games.byStatus.forEach(function(s) {
                statusHtml += '<div class="stat-item"><span>' + s._id + '</span><span class="stat-value">' + s.count + '</span></div>';
            });
        }
        document.getElementById('gamesByStatus').innerHTML = statusHtml;
        
    } catch (e) {
        console.error('Dashboard error:', e);
    }
}

// Show Section
function showSection(section, navElement) {
    currentSection = section;
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(function(n) {
        n.classList.remove('active');
    });
    if (navElement) {
        navElement.classList.add('active');
    }
    
    // Show section
    document.querySelectorAll('.section').forEach(function(s) {
        s.style.display = 'none';
    });
    document.getElementById(section + 'Section').style.display = 'block';
    
    // Load data
    if (section === 'dashboard') loadDashboard();
    else if (section === 'users') loadUsers();
    else if (section === 'games') loadGames();
    else if (section === 'wallet') loadWallet();
}

// Load Users
async function loadUsers() {
    try {
        const res = await fetch(API_URL + '/api/admin/users', {
            headers: { 'x-admin-password': ADMIN_PASSWORD }
        });
        allUsers = await res.json();
        renderUsers(allUsers);
    } catch (e) {
        console.error('Users error:', e);
    }
}

function renderUsers(users) {
    let html = '';
    users.forEach(function(u) {
        html += '<tr>';
        html += '<td><span class="user-id">' + u.odint_id + '</span></td>';
        html += '<td>' + u.username + '</td>';
        html += '<td>' + (u.email || '-') + '</td>';
        html += '<td><span class="balance fun">' + u.fun_balance + '</span></td>';
        html += '<td><span class="balance real">€' + u.real_balance + '</span></td>';
        html += '<td>' + new Date(u.createdAt).toLocaleDateString() + '</td>';
        html += '<td>';
        html += '<button class="btn-small edit-user-btn" data-userid="' + u._id + '">✏️</button>';
        html += '<button class="btn-small danger delete-user-btn" data-userid="' + u._id + '">🗑️</button>';
        html += '</td>';
        html += '</tr>';
    });
    document.getElementById('usersTableBody').innerHTML = html;
    
    // Add event listeners for edit/delete buttons
    document.querySelectorAll('.edit-user-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            editUser(this.getAttribute('data-userid'));
        });
    });
    document.querySelectorAll('.delete-user-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            deleteUser(this.getAttribute('data-userid'));
        });
    });
}

function searchUsers() {
    const query = document.getElementById('userSearch').value.toLowerCase();
    const filtered = allUsers.filter(function(u) {
        return u.username.toLowerCase().includes(query) || 
               u.odint_id.toLowerCase().includes(query) ||
               (u.email && u.email.toLowerCase().includes(query));
    });
    renderUsers(filtered);
}

// Edit User Modal
function editUser(userId) {
    const user = allUsers.find(function(u) { return u._id === userId; });
    if (!user) return;
    
    document.getElementById('editUserId').value = userId;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editFunBalance').value = user.fun_balance;
    document.getElementById('editRealBalance').value = user.real_balance;
    
    document.getElementById('userModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('userModal').style.display = 'none';
}

async function saveUser() {
    const userId = document.getElementById('editUserId').value;
    const data = {
        username: document.getElementById('editUsername').value,
        email: document.getElementById('editEmail').value,
        fun_balance: parseFloat(document.getElementById('editFunBalance').value),
        real_balance: parseFloat(document.getElementById('editRealBalance').value)
    };
    
    try {
        const res = await fetch(API_URL + '/api/admin/users/' + userId, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': ADMIN_PASSWORD
            },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            closeModal();
            loadUsers();
            alert('Utente aggiornato!');
        } else {
            alert('Errore aggiornamento');
        }
    } catch (e) {
        alert('Errore: ' + e.message);
    }
}

async function deleteUser(userId) {
    if (!confirm('Sei sicuro di voler eliminare questo utente?')) return;
    
    try {
        const res = await fetch(API_URL + '/api/admin/users/' + userId, {
            method: 'DELETE',
            headers: { 'x-admin-password': ADMIN_PASSWORD }
        });
        
        if (res.ok) {
            loadUsers();
            alert('Utente eliminato!');
        }
    } catch (e) {
        alert('Errore: ' + e.message);
    }
}

// Add Balance
async function addBalance() {
    const userId = document.getElementById('balanceUserId').value;
    const type = document.getElementById('balanceType').value;
    const amount = parseFloat(document.getElementById('balanceAmount').value);
    
    if (!userId || !amount) {
        alert('Inserisci ID utente e importo');
        return;
    }
    
    // Find user by odint_id
    const user = allUsers.find(function(u) { 
        return u.odint_id === userId.toUpperCase(); 
    });
    
    if (!user) {
        alert('Utente non trovato. Carica prima la lista utenti.');
        return;
    }
    
    try {
        const res = await fetch(API_URL + '/api/admin/users/' + user._id + '/balance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': ADMIN_PASSWORD
            },
            body: JSON.stringify({ type: type, amount: amount })
        });
        
        const data = await res.json();
        if (res.ok) {
            alert('Balance aggiornato! Nuovo ' + type + ': ' + data.user[type + '_balance']);
            loadUsers();
            // Clear inputs
            document.getElementById('balanceUserId').value = '';
            document.getElementById('balanceAmount').value = '';
        } else {
            alert('Errore: ' + data.error);
        }
    } catch (e) {
        alert('Errore: ' + e.message);
    }
}

// Load Games
async function loadGames() {
    try {
        const res = await fetch(API_URL + '/api/admin/games', {
            headers: { 'x-admin-password': ADMIN_PASSWORD }
        });
        allGames = await res.json();
        renderGames(allGames);
    } catch (e) {
        console.error('Games error:', e);
    }
}

function renderGames(games) {
    let html = '';
    games.forEach(function(g) {
        var statusClass = g.status === 'playing' ? 'playing' : g.status === 'finished' ? 'finished' : 'waiting';
        html += '<tr>';
        html += '<td><span class="game-id">' + g._id.slice(-8) + '</span></td>';
        html += '<td>' + (g.player1 && g.player1.username ? g.player1.username : '-') + '</td>';
        html += '<td>' + (g.player2 && g.player2.username ? g.player2.username : '-') + '</td>';
        html += '<td><span class="status ' + statusClass + '">' + g.status + '</span></td>';
        html += '<td>€' + g.stake + '</td>';
        html += '<td>' + (g.is_public ? '🌍 Public' : '🔒 Private') + '</td>';
        html += '<td>' + (g.pin_code || '-') + '</td>';
        html += '<td>';
        html += '<button class="btn-small view-game-btn" data-gameid="' + g._id + '">👁️</button>';
        html += '<button class="btn-small danger delete-game-btn" data-gameid="' + g._id + '">🗑️</button>';
        html += '</td>';
        html += '</tr>';
    });
    document.getElementById('gamesTableBody').innerHTML = html;
    
    // Add event listeners
    document.querySelectorAll('.view-game-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            viewGame(this.getAttribute('data-gameid'));
        });
    });
    document.querySelectorAll('.delete-game-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            deleteGame(this.getAttribute('data-gameid'));
        });
    });
}

function filterGames() {
    const status = document.getElementById('gameStatusFilter').value;
    var filtered = status ? allGames.filter(function(g) { return g.status === status; }) : allGames;
    renderGames(filtered);
}

async function deleteGame(gameId) {
    if (!confirm('Eliminare questa partita?')) return;
    
    try {
        const res = await fetch(API_URL + '/api/admin/games/' + gameId, {
            method: 'DELETE',
            headers: { 'x-admin-password': ADMIN_PASSWORD }
        });
        
        if (res.ok) {
            loadGames();
            alert('Partita eliminata!');
        }
    } catch (e) {
        alert('Errore: ' + e.message);
    }
}

function viewGame(gameId) {
    const game = allGames.find(function(g) { return g._id === gameId; });
    if (!game) return;
    
    var board = '';
    for (var i = 0; i < 9; i++) {
        var cell = game.board[i] || ' ';
        board += cell + (i % 3 === 2 ? '\n' : ' | ');
    }
    
    var p1 = game.player1 && game.player1.username ? game.player1.username : '-';
    var p2 = game.player2 && game.player2.username ? game.player2.username : '-';
    
    alert('Partita: ' + gameId + '\n\nBoard:\n' + board + '\n\nPlayer 1 (X): ' + p1 + '\nPlayer 2 (O): ' + p2 + '\nStatus: ' + game.status + '\nWinner: ' + (game.winner || '-'));
}

// Load Wallet
async function loadWallet() {
    try {
        const res = await fetch(API_URL + '/api/admin/wallet', {
            headers: { 'x-admin-password': ADMIN_PASSWORD }
        });
        const data = await res.json();
        
        document.getElementById('hotWalletAddress').textContent = data.address;
        document.getElementById('hotWalletBalance').textContent = data.balanceSats.toLocaleString() + ' sats';
        document.getElementById('btcPrice').textContent = '$' + (data.btcPrice || 0).toLocaleString();
        
        // Deposits
        var depositsHtml = '';
        if (data.deposits && data.deposits.length > 0) {
            data.deposits.forEach(function(d) {
                depositsHtml += '<tr>';
                depositsHtml += '<td>' + (d.user && d.user.username ? d.user.username : '-') + '</td>';
                depositsHtml += '<td>' + d.amount + ' sats</td>';
                depositsHtml += '<td><span class="status ' + d.status + '">' + d.status + '</span></td>';
                depositsHtml += '<td>' + new Date(d.createdAt).toLocaleString() + '</td>';
                depositsHtml += '</tr>';
            });
        } else {
            depositsHtml = '<tr><td colspan="4">Nessun deposito</td></tr>';
        }
        document.getElementById('depositsTableBody').innerHTML = depositsHtml;
        
    } catch (e) {
        console.error('Wallet error:', e);
    }
}

// Settings
function updateAdminPassword() {
    const newPass = document.getElementById('newAdminPassword').value;
    if (!newPass || newPass.length < 8) {
        alert('Password deve essere almeno 8 caratteri');
        return;
    }
    alert('Per cambiare la password admin, modifica la variabile ADMIN_PASSWORD su Railway');
}

function broadcastMessage() {
    const message = document.getElementById('broadcastMessage').value;
    if (!message) {
        alert('Inserisci un messaggio');
        return;
    }
    alert('Funzione broadcast in sviluppo');
}

// Logout
function logout() {
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('adminPassword').value = '';
    ADMIN_PASSWORD = '';
}

// Refresh data every 30 seconds if on dashboard
setInterval(function() {
    if (ADMIN_PASSWORD && currentSection === 'dashboard') {
        loadDashboard();
    }
}, 30000);
