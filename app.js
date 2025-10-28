(function(){
  'use strict';

  const STORAGE = {
    users: 'clubs.users',
    clubs: 'clubs.clubs',
    events: 'clubs.events',
    attendance: 'clubs.attendance',
    session: 'clubs.session',
    theme: 'clubs.theme',
    memberships: 'clubs.memberships',
    payments: 'clubs.payments',
    finances: 'clubs.finances',
    schedules: 'clubs.schedules',
    eventPayments: 'clubs.eventPayments',
    monthlyContributions: 'clubs.monthlyContributions'
  };

  function load(k){ try { return JSON.parse(localStorage.getItem(STORAGE[k])||'null'); } catch { return null; } }
  function save(k,v){ localStorage.setItem(STORAGE[k], JSON.stringify(v)); }
  function nextId(items){
    if (!Array.isArray(items) || items.length === 0) return 1;
    let maxId = 0;
    for (const item of items) {
      if (item && typeof item.id === 'number' && item.id > maxId) maxId = item.id;
    }
    return maxId + 1;
  }
  function hash(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h + s.charCodeAt(i); h|=0; } return 'h'+(h>>>0); }
  function fmt(ts){ if(!ts) return ''; const d=new Date(ts); return d.toLocaleString('ru-RU'); }
  
  // Financial utilities
  function formatCurrency(amount) {
    return new Intl.NumberFormat('ru-RU', { 
      style: 'currency', 
      currency: 'RUB',
      minimumFractionDigits: 0 
    }).format(amount);
  }
  
  function calculateClubBalance(clubId) {
    const payments = db.payments.filter(p => p.clubId === clubId);
    const finances = db.finances.filter(f => f.clubId === clubId);
    
    const income = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const expenses = finances.filter(f => f.type === 'expense').reduce((sum, f) => sum + (f.amount || 0), 0);
    
    return income - expenses;
  }
  
  function getMembershipStatus(userId, clubId) {
    const membership = db.memberships.find(m => m.userId === userId && m.clubId === clubId);
    if (!membership) return 'not_member';
    
    const now = Date.now();
    if (membership.expiresAt && membership.expiresAt < now) return 'expired';
    return 'active';
  }
  
  // Excel Export Functions - Make them globally accessible
  window.exportToExcel = function(data, filename) {
    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Данные');
      XLSX.writeFile(wb, filename);
      return true;
    } catch (error) {
      console.error('Excel export error:', error);
      showToast('Ошибка при экспорте в Excel', 'error');
      return false;
    }
  };
  
  window.exportStatisticsToExcel = function() {
    try {
      const stats = generateApplicationStatistics();
      const filename = `статистика_клубов_${new Date().toISOString().slice(0,10)}.xlsx`;
      
      const excelData = [
        { 'Метрика': 'Общее количество клубов', 'Значение': stats.totalClubs },
        { 'Метрика': 'Общее количество пользователей', 'Значение': stats.totalUsers },
        { 'Метрика': 'Общее количество событий', 'Значение': stats.totalEvents },
        { 'Метрика': 'Общее количество участников', 'Значение': stats.totalMemberships },
        { 'Метрика': 'Общий доход', 'Значение': stats.totalIncome },
        { 'Метрика': 'Общие расходы', 'Значение': stats.totalExpenses },
        { 'Метрика': 'Общий баланс', 'Значение': stats.totalBalance },
        { 'Метрика': 'Средний доход на клуб', 'Значение': stats.averageIncomePerClub },
        { 'Метрика': 'Самый активный клуб', 'Значение': stats.mostActiveClub }
      ];
      
      if (window.exportToExcel(excelData, filename)) {
        showToast('Статистика экспортирована в Excel', 'success');
      }
    } catch (error) {
      console.error('Statistics export error:', error);
      showToast('Ошибка при экспорте статистики', 'error');
    }
  };
  
  // Global function for marking payments as paid
  window.markAsPaid = function(eventId, userId, amount) {
    if (confirm(`Отметить платеж ${formatCurrency(amount)} как оплаченный?`)) {
      const eventPayments = db.eventPayments;
      eventPayments.push({
        id: nextId(eventPayments),
        eventId: eventId,
        userId: userId,
        amount: amount,
        paidAt: Date.now(),
        status: 'paid'
      });
      db.eventPayments = eventPayments;
      
      // Add to club finances
      const event = db.events.find(e => e.id === eventId);
      if (event) {
        const payments = db.payments;
        payments.push({
          id: nextId(payments),
          clubId: event.clubId,
          userId: userId,
          amount: amount,
          paidAt: Date.now(),
          type: 'event_payment',
          eventId: eventId
        });
        db.payments = payments;
      }
      
      showToast('Платеж отмечен как оплаченный', 'success');
      // Refresh the current page
      const currentPath = location.hash.slice(1);
      const pathParts = currentPath.split('/');
      if (pathParts[0] === 'clubs' && pathParts[2] === 'events' && pathParts[3] === 'payments') {
        EventPayments(Number(pathParts[1]));
      }
    }
  };

  // Global function for marking monthly contributions as paid
  window.markContributionAsPaid = function(clubId, userId, amount) {
    if (confirm(`Отметить взнос ${formatCurrency(amount)} как оплаченный?`)) {
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
      
      const contributions = db.monthlyContributions;
      contributions.push({
        id: nextId(contributions),
        clubId: clubId,
        userId: userId,
        amount: amount,
        month: currentMonth,
        paidAt: Date.now(),
        status: 'paid'
      });
      db.monthlyContributions = contributions;
      
      // Add to club finances
      const payments = db.payments;
      payments.push({
        id: nextId(payments),
        clubId: clubId,
        userId: userId,
        amount: amount,
        paidAt: Date.now(),
        type: 'monthly_contribution',
        month: currentMonth
      });
      db.payments = payments;
      
      showToast('Взнос отмечен как оплаченный', 'success');
      // Refresh the current page
      const currentPath = location.hash.slice(1);
      const pathParts = currentPath.split('/');
      if (pathParts[0] === 'clubs' && pathParts[2] === 'contributions') {
        ClubContributions(Number(pathParts[1]));
      }
    }
  };

  // Global function for creating monthly contributions for all members
  window.createMonthlyContribution = function(clubId) {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const club = db.clubs.find(c => c.id === clubId);
    
    if (!club) {
      showToast('Клуб не найден', 'error');
      return;
    }
    
    const members = db.memberships.filter(m => m.clubId === clubId);
    const existingContributions = db.monthlyContributions.filter(c => c.clubId === clubId && c.month === currentMonth);
    
    if (existingContributions.length > 0) {
      showToast('Взносы за этот месяц уже созданы', 'warning');
      return;
    }
    
    if (confirm(`Создать взносы за ${new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })} для всех участников?`)) {
      const contributions = db.monthlyContributions;
      
      members.forEach(member => {
        contributions.push({
          id: nextId(contributions),
          clubId: clubId,
          userId: member.userId,
          amount: club.membershipFee || 0,
          month: currentMonth,
          paidAt: null,
          status: 'pending'
        });
      });
      
      db.monthlyContributions = contributions;
      showToast(`Созданы взносы для ${members.length} участников`, 'success');
      
      // Refresh the current page
      const currentPath = location.hash.slice(1);
      const pathParts = currentPath.split('/');
      if (pathParts[0] === 'clubs' && pathParts[2] === 'contributions') {
        ClubContributions(Number(pathParts[1]));
      }
    }
  };

  window.exportFinancialReportToExcel = function(clubId, period = 'all') {
    try {
      const club = db.clubs.find(c => c.id === clubId);
      if (!club) {
        showToast('Клуб не найден', 'error');
        return;
      }
      
      const payments = db.payments.filter(p => p.clubId === clubId);
      const finances = db.finances.filter(f => f.clubId === clubId);
      
      let filteredPayments = payments;
      let filteredFinances = finances;
      
      if (period !== 'all') {
        const now = new Date();
        let startDate;
        
        switch (period) {
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'quarter':
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), quarter * 3, 1);
            break;
          case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
        }
        
        if (startDate) {
          filteredPayments = payments.filter(p => new Date(p.paidAt) >= startDate);
          filteredFinances = finances.filter(f => new Date(f.date) >= startDate);
        }
      }
      
      const filename = `финансовый_отчет_${club.name.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}_${period}_${new Date().toISOString().slice(0,10)}.xlsx`;
      
      // Создаем данные для экспорта
      const excelData = [];
      
      // Добавляем доходы
      filteredPayments.forEach(payment => {
        const user = db.users.find(u => u.id === payment.userId);
        excelData.push({
          'Тип': 'Доход',
          'Описание': `Взнос от ${user?.name || 'Неизвестно'}`,
          'Сумма': payment.amount,
          'Дата': fmt(payment.paidAt),
          'Статус': 'Оплачено'
        });
      });
      
      // Добавляем расходы
      filteredFinances.filter(f => f.type === 'expense').forEach(expense => {
        excelData.push({
          'Тип': 'Расход',
          'Описание': expense.description,
          'Сумма': -expense.amount,
          'Дата': fmt(expense.date),
          'Статус': 'Проведен'
        });
      });
      
      if (window.exportToExcel(excelData, filename)) {
        showToast('Финансовый отчет экспортирован в Excel', 'success');
      }
    } catch (error) {
      console.error('Financial export error:', error);
      showToast('Ошибка при экспорте финансового отчета', 'error');
    }
  };
  
  // Statistics Generation Functions
  function generateApplicationStatistics() {
    const clubs = db.clubs;
    const users = db.users;
    const events = db.events;
    const memberships = db.memberships;
    const payments = db.payments;
    const finances = db.finances;
    
    const totalIncome = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalExpenses = finances.filter(f => f.type === 'expense').reduce((sum, f) => sum + (f.amount || 0), 0);
    const totalBalance = totalIncome - totalExpenses;
    
    // Находим самый активный клуб (по количеству событий)
    const clubEventCounts = clubs.map(club => ({
      club,
      eventCount: events.filter(e => e.clubId === club.id).length
    }));
    const mostActiveClub = clubEventCounts.length > 0 ? clubEventCounts.reduce((max, current) => 
      current.eventCount > max.eventCount ? current : max, clubEventCounts[0])?.club?.name || 'Нет данных' : 'Нет данных';
    
    return {
      totalClubs: clubs.length,
      totalUsers: users.length,
      totalEvents: events.length,
      totalMemberships: memberships.length,
      totalIncome,
      totalExpenses,
      totalBalance,
      averageIncomePerClub: clubs.length > 0 ? totalIncome / clubs.length : 0,
      mostActiveClub,
      clubsByOwner: clubs.reduce((acc, club) => {
        const owner = users.find(u => u.id === club.ownerId);
        acc[owner?.name || 'Неизвестно'] = (acc[owner?.name || 'Неизвестно'] || 0) + 1;
        return acc;
      }, {}),
      eventsByMonth: events.reduce((acc, event) => {
        const month = new Date(event.startsAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {}),
      paymentsByMonth: payments.reduce((acc, payment) => {
        const month = new Date(payment.paidAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        acc[month] = (acc[month] || 0) + payment.amount;
        return acc;
      }, {})
    };
  }
  
  function generateClubFinancialStatistics(clubId) {
    const club = db.clubs.find(c => c.id === clubId);
    if (!club) return null;
    
    const payments = db.payments.filter(p => p.clubId === clubId);
    const finances = db.finances.filter(f => f.clubId === clubId);
    
    const contributors = payments.reduce((acc, payment) => {
      const user = db.users.find(u => u.id === payment.userId);
      const userName = user?.name || 'Неизвестно';
      if (!acc[userName]) {
        acc[userName] = { totalAmount: 0, paymentCount: 0, lastPayment: null };
      }
      acc[userName].totalAmount += payment.amount;
      acc[userName].paymentCount += 1;
      if (!acc[userName].lastPayment || payment.paidAt > acc[userName].lastPayment) {
        acc[userName].lastPayment = payment.paidAt;
      }
      return acc;
    }, {});
    
    const monthlyIncome = payments.reduce((acc, payment) => {
      const month = new Date(payment.paidAt).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      acc[month] = (acc[month] || 0) + payment.amount;
      return acc;
    }, {});
    
    const monthlyExpenses = finances.filter(f => f.type === 'expense').reduce((acc, expense) => {
      const month = new Date(expense.date).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      acc[month] = (acc[month] || 0) + expense.amount;
      return acc;
    }, {});
    
    return {
      club,
      totalIncome: payments.reduce((sum, p) => sum + p.amount, 0),
      totalExpenses: finances.filter(f => f.type === 'expense').reduce((sum, f) => sum + f.amount, 0),
      balance: calculateClubBalance(clubId),
      contributors,
      monthlyIncome,
      monthlyExpenses,
      averagePaymentAmount: payments.length > 0 ? payments.reduce((sum, p) => sum + p.amount, 0) / payments.length : 0,
      totalPayments: payments.length,
      totalExpenseTransactions: finances.filter(f => f.type === 'expense').length
    };
  }

  // Russian translations
  const t = {
    // Navigation
    clubs: 'Клубы',
    admin: 'Админ',
    login: 'Войти',
    register: 'Регистрация',
    logout: 'Выйти',
    
    // Common
    name: 'Имя',
    email: 'Email',
    password: 'Пароль',
    description: 'Описание',
    location: 'Место',
    starts: 'Начало',
    ends: 'Конец',
    actions: 'Действия',
    save: 'Сохранить',
    cancel: 'Отмена',
    create: 'Создать',
    edit: 'Редактировать',
    delete: 'Удалить',
    view: 'Просмотр',
    back: 'Назад',
    search: 'Поиск',
    
    // Club related
    createClub: 'Создать клуб',
    editClub: 'Редактировать клуб',
    clubName: 'Название клуба',
    clubDescription: 'Описание клуба',
    owner: 'Владелец',
    events: 'События',
    members: 'Участники',
    finances: 'Финансы',
    schedule: 'Расписание',
    membership: 'Членство',
    
    // Event related
    createEvent: 'Создать событие',
    editEvent: 'Редактировать событие',
    eventTitle: 'Название события',
    eventDescription: 'Описание события',
    eventLocation: 'Место проведения',
    startsAt: 'Начало',
    endsAt: 'Конец',
    register: 'Зарегистрироваться',
    unregister: 'Отменить регистрацию',
    registered: 'Зарегистрировано',
    
    // Financial
    membershipFee: 'Взнос за членство',
    amount: 'Сумма',
    paymentDate: 'Дата платежа',
    paymentStatus: 'Статус платежа',
    paid: 'Оплачено',
    pending: 'Ожидает',
    overdue: 'Просрочено',
    income: 'Доходы',
    expenses: 'Расходы',
    balance: 'Баланс',
    addIncome: 'Добавить доход',
    addExpense: 'Добавить расход',
    
    // Schedule
    weeklySchedule: 'Еженедельное расписание',
    dayOfWeek: 'День недели',
    time: 'Время',
    duration: 'Продолжительность',
    recurring: 'Повторяющееся',
    
    // Days of week
    monday: 'Понедельник',
    tuesday: 'Вторник',
    wednesday: 'Среда',
    thursday: 'Четверг',
    friday: 'Пятница',
    saturday: 'Суббота',
    sunday: 'Воскресенье',
    
    // Status
    active: 'Активный',
    inactive: 'Неактивный',
    expired: 'Истек',
    notMember: 'Не участник',
    
    // Messages
    success: 'Успешно',
    error: 'Ошибка',
    warning: 'Предупреждение',
    confirmDelete: 'Вы уверены, что хотите удалить это? Это действие нельзя отменить.',
    accountCreated: 'Аккаунт создан успешно!',
    welcomeBack: 'Добро пожаловать обратно',
    loggedOut: 'Вы вышли из системы',
    clubCreated: 'Клуб создан успешно!',
    clubUpdated: 'Клуб обновлен успешно!',
    clubDeleted: 'Клуб удален успешно',
    eventCreated: 'Событие создано успешно!',
    eventUpdated: 'Событие обновлено успешно!',
    registeredForEvent: 'Успешно зарегистрированы на событие!',
    unregisteredFromEvent: 'Успешно отменили регистрацию на событие',
    roleUpdated: 'Роль пользователя обновлена',
    passwordTooShort: 'Пароль должен содержать минимум 6 символов',
    emailAlreadyExists: 'Email уже зарегистрирован',
    invalidCredentials: 'Неверный email или пароль',
    eventStartInFuture: 'Время начала события должно быть в будущем',
    eventEndAfterStart: 'Время окончания должно быть после времени начала'
  };

  // Theme Management
  function initTheme() {
    const savedTheme = load('theme') || 'light';
    setTheme(savedTheme);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    save('theme', theme);
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
      themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }

  // Toast Notifications
  function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease-in forwards';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
  }

  // Add slideOut animation to CSS
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  const Roles = { ADMIN:'admin', ORGANIZER:'organizer', MEMBER:'member' };

  function seed(){
    if (!load('users')){
      const admin = { id:1, name:'Администратор', email:'admin@example.com', password:hash('admin123'), role:Roles.ADMIN, createdAt:Date.now() };
      save('users', [admin]); 
      save('clubs', []); 
      save('events', []); 
      save('attendance', []); 
      save('memberships', []); 
      save('payments', []); 
      save('finances', []); 
      save('schedules', []); 
      save('eventPayments', []); 
      save('monthlyContributions', []); 
      save('session', { userId:null });
    }
  }

  const db = Object.defineProperties({}, {
    session: { get(){ return load('session')||{userId:null}; }, set(v){ save('session', v); } },
    users: { get(){ return load('users')||[]; }, set(v){ save('users', v); } },
    clubs: { get(){ return load('clubs')||[]; }, set(v){ save('clubs', v); } },
    events:{ get(){ return load('events')||[]; }, set(v){ save('events', v); } },
    attendance:{ get(){ return load('attendance')||[]; }, set(v){ save('attendance', v); } },
    memberships:{ get(){ return load('memberships')||[]; }, set(v){ save('memberships', v); } },
    payments:{ get(){ return load('payments')||[]; }, set(v){ save('payments', v); } },
    finances:{ get(){ return load('finances')||[]; }, set(v){ save('finances', v); } },
    schedules:{ get(){ return load('schedules')||[]; }, set(v){ save('schedules', v); } },
    eventPayments:{ get(){ return load('eventPayments')||[]; }, set(v){ save('eventPayments', v); } },
    monthlyContributions:{ get(){ return load('monthlyContributions')||[]; }, set(v){ save('monthlyContributions', v); } },
  });

  function me(){ const s=db.session; return s.userId ? db.users.find(u=>u.id===s.userId)||null : null; }
  function canOrganize(u){ return !!u && (u.role===Roles.ADMIN || u.role===Roles.ORGANIZER); }

  const $ = (id)=>document.getElementById(id);
  const app = ()=>$('app');
  const h = (strings,...vals)=>strings.map((s,i)=>s+(i<vals.length?(vals[i]??''):'')).join('');

  function setNav(){
    const user = me();
    const navUser = $('navUser'); const logoutBtn = $('logoutBtn');
    const themeToggle = $('themeToggle');
    
    document.querySelectorAll('.authed').forEach(e=>e.style.display = user ? 'inline' : 'none');
    document.querySelectorAll('.guest-only').forEach(e=>e.style.display = user ? 'none' : 'inline');
    document.querySelectorAll('.admin-only').forEach(e=>e.style.display = (user && user.role===Roles.ADMIN) ? 'inline' : 'none');
    navUser.textContent = user ? `${user.name} (${user.role})` : '';
    logoutBtn.onclick = ()=>{ 
      db.session = { userId:null }; 
      showToast(t.loggedOut, 'success');
      setNav(); 
      go('/'); 
    };
    
    if (themeToggle) {
      themeToggle.onclick = toggleTheme;
    }
  }

  function Home(){
    const user = me();
    app().innerHTML = h`
      <div class="card main-card featured">
        <h1>Распределенные Клубы по Интересам</h1>
        <p>Управляйте членством и событиями в различных клубах.</p>
        ${user ? h`<div class="action-group primary"><a class="btn" href="#/clubs">Перейти к клубам</a></div>` : h`<div class="action-group primary"><a class="btn" href="#/register">Начать</a></div>`}
      </div>
    `;
  }

  function Register(){
    app().innerHTML = h`
      <div class="card main-card">
        <h2>Регистрация</h2>
        <form id="f">
          <div class="form-group"><label>${t.name}</label><input class="input variant-outline" name="name" required></div>
          <div class="form-group"><label>${t.email}</label><input type="email" class="input variant-outline" name="email" required></div>
          <div class="form-group"><label>${t.password}</label><input type="password" class="input variant-outline" name="password" required></div>
          <div class="action-group primary"><button class="btn">${t.register}</button></div>
        </form>
      </div>
    `;
    $('f').onsubmit = (e)=>{
      e.preventDefault(); 
      const data = Object.fromEntries(new FormData(e.target));
      const users = db.users;
      
      // Clear previous alerts
      const existingAlert = e.target.querySelector('.alert');
      if (existingAlert) existingAlert.remove();
      
      // Validation
      if (data.password.length < 6) {
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">${t.passwordTooShort}</div>`);
        return;
      }
      
      if (users.some(u=>u.email.toLowerCase()===String(data.email).toLowerCase())){
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">${t.emailAlreadyExists}</div>`);
        return;
      }
      
      const user = { 
        id:nextId(users), 
        name:data.name.trim(), 
        email:String(data.email).toLowerCase(), 
        password:hash(data.password), 
        role:Roles.MEMBER, 
        createdAt:Date.now() 
      };
      users.push(user); 
      db.users = users; 
      db.session = { userId:user.id }; 
      showToast(t.accountCreated, 'success');
      setNav(); 
      go('/');
    };
  }

  function Login(){
    app().innerHTML = h`
      <div class="card main-card">
        <h2>Вход</h2>
        <form id="f">
          <div class="form-group"><label>${t.email}</label><input type="email" class="input variant-filled" name="email" required></div>
          <div class="form-group"><label>${t.password}</label><input type="password" class="input variant-filled" name="password" required></div>
          <div class="action-group primary"><button class="btn">${t.login}</button></div>
        </form>
      </div>
    `;
    $('f').onsubmit = (e)=>{
      e.preventDefault(); 
      const data = Object.fromEntries(new FormData(e.target));
      
      // Clear previous alerts
      const existingAlert = e.target.querySelector('.alert');
      if (existingAlert) existingAlert.remove();
      
      const user = db.users.find(u=>u.email.toLowerCase()===String(data.email).toLowerCase());
      if (!user || user.password!==hash(data.password)){
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">${t.invalidCredentials}</div>`);
        return;
      }
      db.session = { userId:user.id }; 
      showToast(h`${t.welcomeBack}, ${user.name}!`, 'success');
      setNav(); 
      go('/');
    };
  }

  function Clubs(){
    const user = me(); if(!user){ go('/login'); return; }
    const clubs = db.clubs.slice().sort((a,b)=>a.name.localeCompare(b.name));
    app().innerHTML = h`
      <div class="search-container">
        <input type="text" id="clubSearch" class="input search-input" placeholder="Поиск клубов..." />
        <select id="clubFilter" class="select filter-select">
          <option value="">Все клубы</option>
          <option value="my">Мои клубы</option>
          <option value="other">Другие клубы</option>
          <option value="joined">Клубы, в которых я участвую</option>
          <option value="not-joined">Клубы, в которых я не участвую</option>
        </select>
      </div>
      <div class="action-group mixed" style="margin-bottom:12px">
        ${canOrganize(user)? h`<a class="btn" href="#/clubs/create">${t.createClub}</a>`:''}
      </div>
      <table class="table" id="clubsTable">
        <thead><tr><th>${t.name}</th><th>${t.description}</th><th>${t.owner}</th><th>${t.actions}</th></tr></thead>
        <tbody>
          ${clubs.map(c=>{
            const isMember = db.memberships.some(m => m.userId === user.id && m.clubId === c.id);
            const canAccess = isMember || user.id === c.ownerId || user.role === Roles.ADMIN;
            
            return h`<tr data-club-id="${c.id}" data-owner-id="${c.ownerId}">
              <td>${c.name}</td>
              <td>${c.description||''}</td>
              <td>${db.users.find(u=>u.id===c.ownerId)?.name||'?'} </td>
              <td class="actions">
                <div class="action-group mixed">
                  ${canAccess ? h`
                    <a class="btn tertiary" href="#/clubs/${c.id}/events">${t.events}</a>
                    <a class="btn tertiary" href="#/clubs/${c.id}/members">${t.members}</a>
                    ${(user.id===c.ownerId||user.role===Roles.ADMIN)? h`
                      <a class="btn tertiary" href="#/clubs/${c.id}/finances">${t.finances}</a>
                    `:''}
                    <a class="btn tertiary" href="#/clubs/${c.id}/schedule">${t.schedule}</a>
                    ${isMember && !(user.id===c.ownerId||user.role===Roles.ADMIN) ? h`
                      <button class="btn outline" data-leave="${c.id}">Выйти из клуба</button>
                    `:''}
                  `:''}
                  ${!isMember && !canAccess ? h`
                    <button class="btn" data-register="${c.id}">Зарегистрироваться</button>
                  `:''}
                  ${(user.id===c.ownerId||user.role===Roles.ADMIN)? h`
                    <a class="btn outline" href="#/clubs/${c.id}/edit">${t.edit}</a>
                    <button class="btn danger" data-del="${c.id}">${t.delete}</button>
                  `:''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    
    // Add search and filter functionality
    const searchInput = $('clubSearch');
    const filterSelect = $('clubFilter');
    const table = $('clubsTable');
    
    function filterClubs() {
      const searchTerm = searchInput.value.toLowerCase();
      const filterValue = filterSelect.value;
      const rows = table.querySelectorAll('tbody tr');
      
      rows.forEach(row => {
        const name = row.cells[0].textContent.toLowerCase();
        const description = row.cells[1].textContent.toLowerCase();
        const owner = row.cells[2].textContent.toLowerCase();
        const ownerId = row.getAttribute('data-owner-id');
        const clubId = Number(row.getAttribute('data-club-id'));
        
        let matchesSearch = !searchTerm || 
          name.includes(searchTerm) || 
          description.includes(searchTerm) || 
          owner.includes(searchTerm);
          
        let matchesFilter = true;
        const isMember = clubId ? db.memberships.some(m => m.userId === user.id && m.clubId === clubId) : false;
        
        if (filterValue === 'my') {
          matchesFilter = ownerId && Number(ownerId) === user.id;
        } else if (filterValue === 'other') {
          matchesFilter = !ownerId || Number(ownerId) !== user.id;
        } else if (filterValue === 'joined') {
          matchesFilter = isMember;
        } else if (filterValue === 'not-joined') {
          matchesFilter = !isMember;
        }
        
        row.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
      });
    }
    
    searchInput.addEventListener('input', filterClubs);
    filterSelect.addEventListener('change', filterClubs);
    
    // Handle register button clicks
    app().querySelectorAll('[data-register]').forEach(b=>b.onclick=()=>{
      const clubId = Number(b.getAttribute('data-register'));
      ClubRegister(clubId);
    });
    
    // Handle leave button clicks
    app().querySelectorAll('[data-leave]').forEach(b=>b.onclick=()=>{
      const clubId = Number(b.getAttribute('data-leave'));
      ClubLeave(clubId);
    });
    
    app().querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
      const id = Number(b.getAttribute('data-del'));
      if (confirm(t.confirmDelete)) {
        // Remove club
        db.clubs = db.clubs.filter(c=>c.id!==id);

        // Remove club events and related attendance
        const deletedEvents = db.events.filter(e=>e.clubId===id);
        const deletedEventIds = new Set(deletedEvents.map(e=>e.id));
        db.events = db.events.filter(e=>e.clubId!==id);
        db.attendance = db.attendance.filter(a=>!deletedEventIds.has(a.eventId));

        // Remove schedules
        db.schedules = db.schedules.filter(s=>s.clubId!==id);

        // Remove memberships
        db.memberships = db.memberships.filter(m=>m.clubId!==id);

        // Remove finances and payments related to this club
        db.finances = db.finances.filter(f=>f.clubId!==id);
        db.payments = db.payments.filter(p=>p.clubId!==id);

        // Remove event payments related to deleted events
        db.eventPayments = db.eventPayments.filter(p=>!deletedEventIds.has(p.eventId));

        // Remove monthly contributions of this club
        db.monthlyContributions = db.monthlyContributions.filter(c=>c.clubId!==id);

        showToast(t.clubDeleted, 'success');
        Clubs();
      }
    });
  }

  function ClubCreate(){
    const user = me(); if(!user||!canOrganize(user)){ go('/clubs'); return; }
    app().innerHTML = h`
      <div class="card main-card info">
        <h2>${t.createClub}</h2>
        <form id="f">
          <div class="form-group"><label>${t.clubName}</label><input class="input variant-outline" name="name" required></div>
          <div class="form-group"><label>${t.clubDescription}</label><textarea class="textarea variant-outline" name="description"></textarea></div>
          <div class="form-group"><label>${t.membershipFee}</label><input type="number" class="input variant-outline" name="membershipFee" placeholder="0" min="0"></div>
          <div class="action-group mixed"><button class="btn">${t.create}</button> <a class="btn tertiary" href="#/clubs">${t.cancel}</a></div>
        </form>
      </div>
    `;
    $('f').onsubmit = (e)=>{
      e.preventDefault(); 
      const data = Object.fromEntries(new FormData(e.target));
      const clubs = db.clubs; 
      clubs.push({ 
        id:nextId(clubs), 
        name:data.name.trim(), 
        description:data.description, 
        membershipFee: Number(data.membershipFee) || 0,
        ownerId:user.id, 
        createdAt:Date.now() 
      }); 
      db.clubs = clubs; 
      showToast(t.clubCreated, 'success');
      go('/clubs');
    };
  }

  function ClubEdit(id){
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===id); if(!club){ go('/clubs'); return; }
    if (club.ownerId!==user.id && user.role!==Roles.ADMIN){ go('/clubs'); return; }
    app().innerHTML = h`
      <div class="card main-card warning">
        <h2>${t.editClub}</h2>
        <form id="f">
          <div class="form-group"><label>${t.clubName}</label><input class="input variant-filled" name="name" value="${club.name}" required></div>
          <div class="form-group"><label>${t.clubDescription}</label><textarea class="textarea variant-filled" name="description">${club.description||''}</textarea></div>
          <div class="form-group"><label>${t.membershipFee}</label><input type="number" class="input variant-filled" name="membershipFee" value="${club.membershipFee || 0}" min="0"></div>
          <div class="action-group mixed"><button class="btn">${t.save}</button> <a class="btn tertiary" href="#/clubs">${t.cancel}</a></div>
        </form>
      </div>
    `;
    $('f').onsubmit = (e)=>{
      e.preventDefault(); 
      const data = Object.fromEntries(new FormData(e.target));
      club.name = data.name.trim(); 
      club.description = data.description; 
      club.membershipFee = Number(data.membershipFee) || 0;
      db.clubs = db.clubs; 
      showToast(t.clubUpdated, 'success');
      go('/clubs');
    };
  }

  function Events(clubId){
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Check if user is a member, owner, or admin
    const isMember = db.memberships.some(m => m.userId === user.id && m.clubId === clubId);
    const canAccess = isMember || user.id === club.ownerId || user.role === Roles.ADMIN;
    
    if (!canAccess) {
      showToast('Доступ ограничен. Вы должны быть участником клуба для просмотра событий.', 'error');
      Clubs();
      return;
    }
    
    const events = db.events.filter(e=>e.clubId===clubId).sort((a,b)=>b.startsAt-a.startsAt);
    app().innerHTML = h`
      <div class="search-container">
        <input type="text" id="eventSearch" class="input search-input" placeholder="Поиск событий..." />
        <select id="eventFilter" class="select filter-select">
          <option value="">Все события</option>
          <option value="upcoming">Предстоящие</option>
          <option value="past">Прошедшие</option>
        </select>
      </div>
        <div class="action-group mixed" style="margin-bottom:12px">
        <a class="btn tertiary" href="#/clubs">${t.back}</a>
        ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`<a class="btn" href="#/clubs/${clubId}/events/create">${t.createEvent}</a>`:''}
        ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`<a class="btn secondary" href="#/clubs/${clubId}/events/payments">Управление платежами</a>`:''}
      </div>
      <table class="table" id="eventsTable">
        <thead><tr><th>Название</th><th>Тип</th><th>Цена</th><th>${t.starts}</th><th>${t.ends}</th><th>${t.actions}</th></tr></thead>
        <tbody>
          ${events.map(ev=>h`<tr>
            <td>${ev.title}</td>
            <td>
              <span class="badge ${ev.eventType === 'paid' ? 'badge-paid' : 'badge-free'}">
                ${ev.eventType === 'paid' ? 'Платное' : 'Бесплатное'}
              </span>
            </td>
            <td>${ev.eventType === 'paid' ? formatCurrency(ev.price) : '—'}</td>
            <td>${fmt(ev.startsAt)}</td>
            <td>${fmt(ev.endsAt)}</td>
            <td class="actions">
              <div class="action-group mixed">
                <a class="btn outline" href="#/clubs/${clubId}/events/${ev.id}">${t.view}</a>
                ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`<a class="btn flat" href="#/clubs/${clubId}/events/${ev.id}/edit">${t.edit}</a>`:''}
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    `;
    
    // Add search and filter functionality
    const searchInput = $('eventSearch');
    const filterSelect = $('eventFilter');
    const table = $('eventsTable');
    
    function filterEvents() {
      const searchTerm = searchInput.value.toLowerCase();
      const filterValue = filterSelect.value;
      const rows = table.querySelectorAll('tbody tr');
      const now = Date.now();
      
      rows.forEach(row => {
        const title = row.cells[0].textContent.toLowerCase();
        const startsAt = row.cells[3].textContent;
        const eventTime = new Date(startsAt).getTime();
        
        let matchesSearch = !searchTerm || title.includes(searchTerm);
        
        let matchesFilter = true;
        if (filterValue === 'upcoming') {
          matchesFilter = eventTime > now;
        } else if (filterValue === 'past') {
          matchesFilter = eventTime <= now;
        }
        
        row.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
      });
    }
    
    searchInput.addEventListener('input', filterEvents);
    filterSelect.addEventListener('change', filterEvents);
  }

  function EventCreate(clubId){
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club || (club.ownerId!==user.id && user.role!==Roles.ADMIN)){ go(`/clubs/${clubId}/events`); return; }
    app().innerHTML = h`
      <div class="card main-card featured">
        <h2>${t.createEvent} для ${club.name}</h2>
        <form id="f">
          <div class="form-group"><label>${t.eventTitle}</label><input class="input variant-minimal" name="title" required></div>
          <div class="form-group"><label>${t.eventDescription}</label><textarea class="textarea variant-minimal" name="description"></textarea></div>
          <div class="form-group"><label>${t.eventLocation}</label><input class="input variant-minimal" name="location"></div>
          <div class="form-group"><label>${t.startsAt}</label><input type="datetime-local" class="input variant-minimal" name="startsAt" required></div>
          <div class="form-group"><label>${t.endsAt}</label><input type="datetime-local" class="input variant-minimal" name="endsAt"></div>
          <div class="form-group">
            <label>Тип события</label>
            <select name="eventType" class="select" required>
              <option value="free">Бесплатное</option>
              <option value="paid">Платное</option>
            </select>
          </div>
          <div class="form-group" id="priceGroup" style="display:none">
            <label>Цена (₽)</label>
            <input type="number" class="input variant-minimal" name="price" min="0" step="0.01" placeholder="0.00">
          </div>
          <div class="action-group mixed"><button class="btn">${t.create}</button> <a class="btn tertiary" href="#/clubs/${clubId}/events">${t.cancel}</a></div>
        </form>
      </div>
    `;
    
    // Handle event type change
    const eventTypeSelect = document.querySelector('select[name="eventType"]');
    const priceGroup = document.getElementById('priceGroup');
    const priceInput = document.querySelector('input[name="price"]');
    
    eventTypeSelect.addEventListener('change', function() {
      if (this.value === 'paid') {
        priceGroup.style.display = 'block';
        priceInput.required = true;
      } else {
        priceGroup.style.display = 'none';
        priceInput.required = false;
        priceInput.value = '';
      }
    });
    
    $('f').onsubmit = (e)=>{
      e.preventDefault(); 
      const data = Object.fromEntries(new FormData(e.target));
      
      // Clear previous alerts
      const existingAlert = e.target.querySelector('.alert');
      if (existingAlert) existingAlert.remove();
      
      // Validation
      const startsAt = Date.parse(data.startsAt);
      const endsAt = data.endsAt ? Date.parse(data.endsAt) : null;
      
      if (startsAt < Date.now()) {
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">${t.eventStartInFuture}</div>`);
        return;
      }
      
      if (endsAt && endsAt <= startsAt) {
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">${t.eventEndAfterStart}</div>`);
        return;
      }
      
      if (data.eventType === 'paid' && (!data.price || parseFloat(data.price) <= 0)) {
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">Для платного события необходимо указать цену больше 0</div>`);
        return;
      }
      
      const events = db.events; 
      events.push({ 
        id:nextId(events), 
        clubId, 
        title:data.title.trim(), 
        description:data.description, 
        location:data.location, 
        startsAt, 
        endsAt, 
        eventType: data.eventType,
        price: data.eventType === 'paid' ? parseFloat(data.price) : 0,
        createdAt:Date.now() 
      }); 
      db.events = events; 
      showToast(t.eventCreated, 'success');
      go(`/clubs/${clubId}/events`);
    };
  }

  function EventDetail(clubId, eventId){
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); const ev = db.events.find(e=>e.id===eventId && e.clubId===clubId);
    if(!club||!ev){ go('/clubs'); return; }
    
    // Check if user is a member, owner, or admin
    const isMember = db.memberships.some(m => m.userId === user.id && m.clubId === clubId);
    const canAccess = isMember || user.id === club.ownerId || user.role === Roles.ADMIN;
    
    if (!canAccess) {
      showToast('Доступ ограничен. Вы должны быть участником клуба для просмотра событий.', 'error');
      Events(clubId);
      return;
    }
    
    const isReg = db.attendance.some(a=>a.eventId===ev.id && a.userId===user.id);
    const count = db.attendance.filter(a=>a.eventId===ev.id).length;
    const hasPaid = ev.eventType === 'paid' ? db.eventPayments.some(p=>p.eventId===ev.id && p.userId===user.id) : true;
    const paymentStatus = ev.eventType === 'paid' ? (hasPaid ? 'paid' : 'unpaid') : 'free';
    
    app().innerHTML = h`
      <div class="action-group mixed" style="margin-bottom:12px">
        <a class="btn tertiary" href="#/clubs/${clubId}/events">${t.back}</a>
        ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`<a class="btn" href="#/clubs/${clubId}/events/${eventId}/edit">${t.edit}</a>`:''}
      </div>
      <div class="card main-card">
        <h2>${ev.title}</h2>
        <p class="muted">${club.name} · ${ev.location||''}</p>
        <p>${ev.description||''}</p>
        <p><b>${t.starts}:</b> ${fmt(ev.startsAt)} ${ev.endsAt?h`· <b>${t.ends}:</b> ${fmt(ev.endsAt)}`:''}</p>
        <p><b>Тип события:</b> 
          <span class="badge ${ev.eventType === 'paid' ? 'badge-paid' : 'badge-free'}">
            ${ev.eventType === 'paid' ? 'Платное' : 'Бесплатное'}
          </span>
        </p>
        ${ev.eventType === 'paid' ? h`<p><b>Цена:</b> ${formatCurrency(ev.price)}</p>` : ''}
        <p><b>${t.registered}:</b> ${count}</p>
        ${ev.eventType === 'paid' && isReg ? h`
          <p><b>Статус оплаты:</b> 
            <span class="badge ${paymentStatus === 'paid' ? 'badge-paid' : 'badge-unpaid'}">
              ${paymentStatus === 'paid' ? 'Оплачено' : 'Не оплачено'}
            </span>
          </p>
        ` : ''}
        <div class="action-group primary">
          ${isReg ? h`
            ${ev.eventType === 'paid' && !hasPaid ? h`
              <button class="btn" id="pay">Оплатить ${formatCurrency(ev.price)}</button>
            ` : ''}
            <button class="btn danger" id="unreg">${t.unregister}</button>
          ` : h`
            ${ev.eventType === 'paid' ? h`
              <button class="btn" id="registerAndPay">Зарегистрироваться и оплатить ${formatCurrency(ev.price)}</button>
            ` : h`
              <button class="btn" id="reg">${t.register}</button>
            `}
          `}
        </div>
      </div>
    `;
    const reg=$('reg'), unreg=$('unreg'), pay=$('pay'), registerAndPay=$('registerAndPay');
    
    // Handle free event registration
    if (reg){ 
      reg.onclick=()=>{ 
        const at=db.attendance; 
        at.push({ 
          id:nextId(at), 
          eventId:ev.id, 
          userId:user.id, 
          registeredAt:Date.now() 
        }); 
        db.attendance=at; 
        showToast(t.registeredForEvent, 'success');
        EventDetail(clubId,eventId); 
      }; 
    }
    
    // Handle paid event registration and payment
    if (registerAndPay){ 
      registerAndPay.onclick=()=>{ 
        // Register for event
        const at=db.attendance; 
        at.push({ 
          id:nextId(at), 
          eventId:ev.id, 
          userId:user.id, 
          registeredAt:Date.now() 
        }); 
        db.attendance=at;
        
        // Record payment
        const eventPayments = db.eventPayments;
        eventPayments.push({
          id: nextId(eventPayments),
          eventId: ev.id,
          userId: user.id,
          amount: ev.price,
          paidAt: Date.now(),
          status: 'paid'
        });
        db.eventPayments = eventPayments;
        
        // Add to club finances
        const payments = db.payments;
        payments.push({
          id: nextId(payments),
          clubId: clubId,
          userId: user.id,
          amount: ev.price,
          paidAt: Date.now(),
          type: 'event_payment',
          eventId: ev.id
        });
        db.payments = payments;
        
        showToast(`Успешно зарегистрированы и оплатили ${formatCurrency(ev.price)}`, 'success');
        EventDetail(clubId,eventId); 
      }; 
    }
    
    // Handle payment for already registered user
    if (pay){ 
      pay.onclick=()=>{ 
        // Record payment
        const eventPayments = db.eventPayments;
        eventPayments.push({
          id: nextId(eventPayments),
          eventId: ev.id,
          userId: user.id,
          amount: ev.price,
          paidAt: Date.now(),
          status: 'paid'
        });
        db.eventPayments = eventPayments;
        
        // Add to club finances
        const payments = db.payments;
        payments.push({
          id: nextId(payments),
          clubId: clubId,
          userId: user.id,
          amount: ev.price,
          paidAt: Date.now(),
          type: 'event_payment',
          eventId: ev.id
        });
        db.payments = payments;
        
        showToast(`Успешно оплатили ${formatCurrency(ev.price)}`, 'success');
        EventDetail(clubId,eventId); 
      }; 
    }
    
    if (unreg){ 
      unreg.onclick=()=>{ 
        db.attendance = db.attendance.filter(a=>!(a.eventId===ev.id && a.userId===user.id)); 
        // Also remove payment if it exists
        db.eventPayments = db.eventPayments.filter(p=>!(p.eventId===ev.id && p.userId===user.id));
        showToast(t.unregisteredFromEvent, 'success');
        EventDetail(clubId,eventId); 
      } 
    }
  }

  function EventEdit(clubId, eventId){
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); const ev = db.events.find(e=>e.id===eventId && e.clubId===clubId);
    if(!club||!ev){ 
      go('/clubs');
      return; 
    }
    if(club.ownerId!==user.id && user.role!==Roles.ADMIN){ 
      go(`/clubs/${clubId}/events/${eventId}`); 
      return; 
    }
    const toInput = ts=> ts ? new Date(ts).toISOString().slice(0,16) : '';
    app().innerHTML = h`
      <div class="card main-card error">
        <h2>${t.editEvent} для ${club.name}</h2>
        <form id="f">
          <div class="form-group"><label>${t.eventTitle}</label><input class="input variant-filled" name="title" value="${ev.title}" required></div>
          <div class="form-group"><label>${t.eventDescription}</label><textarea class="textarea variant-filled" name="description">${ev.description||''}</textarea></div>
          <div class="form-group"><label>${t.eventLocation}</label><input class="input variant-filled" name="location" value="${ev.location||''}"></div>
          <div class="form-group"><label>${t.startsAt}</label><input type="datetime-local" class="input variant-filled" name="startsAt" value="${toInput(ev.startsAt)}" required></div>
          <div class="form-group"><label>${t.endsAt}</label><input type="datetime-local" class="input variant-filled" name="endsAt" value="${toInput(ev.endsAt)}"></div>
          <div class="form-group">
            <label>Тип события</label>
            <select name="eventType" class="select" required>
              <option value="free" ${ev.eventType === 'free' ? 'selected' : ''}>Бесплатное</option>
              <option value="paid" ${ev.eventType === 'paid' ? 'selected' : ''}>Платное</option>
            </select>
          </div>
          <div class="form-group" id="priceGroup" style="display:${ev.eventType === 'paid' ? 'block' : 'none'}">
            <label>Цена (₽)</label>
            <input type="number" class="input variant-filled" name="price" min="0" step="0.01" placeholder="0.00" value="${ev.price || 0}">
          </div>
          <div class="action-group mixed"><button class="btn">${t.save}</button> <a class="btn tertiary" href="#/clubs/${clubId}/events">${t.cancel}</a></div>
        </form>
      </div>
    `;
    
    // Handle event type change
    const eventTypeSelect = document.querySelector('select[name="eventType"]');
    const priceGroup = document.getElementById('priceGroup');
    const priceInput = document.querySelector('input[name="price"]');
    
    eventTypeSelect.addEventListener('change', function() {
      if (this.value === 'paid') {
        priceGroup.style.display = 'block';
        priceInput.required = true;
      } else {
        priceGroup.style.display = 'none';
        priceInput.required = false;
        priceInput.value = '';
      }
    });
    
    $('f').onsubmit=(e)=>{
      e.preventDefault(); 
      const data = Object.fromEntries(new FormData(e.target));
      
      // Clear previous alerts
      const existingAlert = e.target.querySelector('.alert');
      if (existingAlert) existingAlert.remove();
      
      // Validation
      const startsAt = Date.parse(data.startsAt);
      const endsAt = data.endsAt ? Date.parse(data.endsAt) : null;
      
      if (startsAt < Date.now()) {
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">${t.eventStartInFuture}</div>`);
        return;
      }
      
      if (endsAt && endsAt <= startsAt) {
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">${t.eventEndAfterStart}</div>`);
        return;
      }
      
      if (data.eventType === 'paid' && (!data.price || parseFloat(data.price) <= 0)) {
        e.target.insertAdjacentHTML('afterbegin', h`<div class="alert error">Для платного события необходимо указать цену больше 0</div>`);
        return;
      }
      
      ev.title=data.title.trim(); 
      ev.description=data.description; 
      ev.location=data.location; 
      ev.startsAt=startsAt; 
      ev.endsAt=endsAt; 
      ev.eventType = data.eventType;
      ev.price = data.eventType === 'paid' ? parseFloat(data.price) : 0;
      db.events=db.events; 
      showToast(t.eventUpdated, 'success');
      go(`/clubs/${clubId}/events`);
    };
  }

  function EventPayments(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Only allow admin or club owner to view event payments
    if (user.role !== Roles.ADMIN && user.id !== club.ownerId) {
      showToast('Доступ ограничен. Просмотр платежей доступен только администраторам и владельцам клубов.', 'error');
      Events(clubId);
      return;
    }
    
    const events = db.events.filter(e => e.clubId === clubId && e.eventType === 'paid');
    const eventPayments = db.eventPayments.filter(p => {
      const event = events.find(e => e.id === p.eventId);
      return event;
    });
    
    // Group payments by event
    const paymentsByEvent = events.map(event => {
      const payments = eventPayments.filter(p => p.eventId === event.id);
      const attendees = db.attendance.filter(a => a.eventId === event.id);
      
      return {
        event,
        payments,
        attendees,
        totalRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
        paidCount: payments.length,
        unpaidCount: attendees.length - payments.length,
        unpaidAttendees: attendees.filter(a => !payments.some(p => p.userId === a.userId))
      };
    });
    
    app().innerHTML = h`
      <div class="action-group mixed" style="margin-bottom:12px">
        <a class="btn tertiary" href="#/clubs/${clubId}/events">${t.back}</a>
      </div>
      <div class="card main-card">
        <h2>Управление платежами - ${club.name}</h2>
        <div class="financial-summary">
          <div class="summary-card income">
            <div class="summary-amount income">${formatCurrency(paymentsByEvent.reduce((sum, e) => sum + e.totalRevenue, 0))}</div>
            <div class="summary-label">Общий доход от событий</div>
          </div>
          <div class="summary-card">
            <div class="summary-amount">${paymentsByEvent.reduce((sum, e) => sum + e.paidCount, 0)}</div>
            <div class="summary-label">Всего оплачено</div>
          </div>
          <div class="summary-card">
            <div class="summary-amount">${paymentsByEvent.reduce((sum, e) => sum + e.unpaidCount, 0)}</div>
            <div class="summary-label">Ожидают оплаты</div>
          </div>
        </div>
        
        ${paymentsByEvent.map(eventData => h`
          <div class="card" style="margin-bottom: var(--space-lg);">
            <h3>${eventData.event.title}</h3>
            <p class="muted">${fmt(eventData.event.startsAt)} · ${formatCurrency(eventData.event.price)}</p>
            
            <div class="row">
              <div class="col">
                <h4>Статистика платежей</h4>
                <p><strong>Всего участников:</strong> ${eventData.attendees.length}</p>
                <p><strong>Оплатили:</strong> ${eventData.paidCount}</p>
                <p><strong>Не оплатили:</strong> ${eventData.unpaidCount}</p>
                <p><strong>Общий доход:</strong> ${formatCurrency(eventData.totalRevenue)}</p>
              </div>
            </div>
            
            <h4>Участники, которые не оплатили</h4>
            ${eventData.unpaidAttendees.length > 0 ? h`
              <table class="table">
                <thead><tr><th>Участник</th><th>Email</th><th>Дата регистрации</th><th>Действия</th></tr></thead>
                <tbody>
                  ${eventData.unpaidAttendees.map(attendee => {
                    const attendeeUser = db.users.find(u => u.id === attendee.userId);
                    return h`<tr>
                      <td>${attendeeUser?.name || 'Неизвестно'}</td>
                      <td>${attendeeUser?.email || '—'}</td>
                      <td>${fmt(attendee.registeredAt)}</td>
                      <td>
                        <button class="btn secondary" onclick="markAsPaid(${eventData.event.id}, ${attendee.userId}, ${eventData.event.price})">
                          Отметить как оплачено
                        </button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            ` : h`<p class="muted">Все участники оплатили участие</p>`}
            
            <h4>История платежей</h4>
            ${eventData.payments.length > 0 ? h`
              <table class="table">
                <thead><tr><th>Участник</th><th>Сумма</th><th>Дата оплаты</th><th>Статус</th></tr></thead>
                <tbody>
                  ${eventData.payments.map(payment => {
                    const paymentUser = db.users.find(u => u.id === payment.userId);
                    return h`<tr>
                      <td>${paymentUser?.name || 'Неизвестно'}</td>
                      <td>${formatCurrency(payment.amount)}</td>
                      <td>${fmt(payment.paidAt)}</td>
                      <td>
                        <span class="badge badge-paid">Оплачено</span>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            ` : h`<p class="muted">Платежей пока нет</p>`}
          </div>
        `).join('')}
      </div>
    `;
  }

  function Admin(){
    const user = me(); if(!user||user.role!==Roles.ADMIN){ go('/'); return; }
    const users = db.users.slice().sort((a,b)=>b.createdAt-a.createdAt);
    app().innerHTML = h`
      <div class="card main-card">
        <h2>Пользователи</h2>
        <table class="table">
          <thead><tr><th>${t.name}</th><th>${t.email}</th><th>Роль</th><th>${t.actions}</th></tr></thead>
          <tbody>
            ${users.map(u=>h`<tr>
              <td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
              <td class="actions">
                <div class="action-group mixed">
                  <select data-role="${u.id}" class="select">
                    ${[Roles.ADMIN, Roles.ORGANIZER, Roles.MEMBER].map(r=>h`<option value="${r}" ${r===u.role?'selected':''}>${r}</option>`).join('')}
                  </select>
                  <button class="btn flat" data-update="${u.id}">Обновить</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    app().querySelectorAll('[data-update]').forEach(b=>b.onclick=()=>{
      const id = Number(b.getAttribute('data-update'));
      const sel = app().querySelector(`[data-role="${id}"]`);
      const role = sel.value; 
      const users = db.users; 
      const u = users.find(x=>x.id===id); 
      if(!u) return; 
      u.role = role; 
      db.users = users; 
      showToast(h`${t.roleUpdated} на ${role}`, 'success');
      Admin();
    });
  }

  // New functions for members, finances, and schedules
  function ClubMembers(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Check if user is a member, owner, or admin
    const isMember = db.memberships.some(m => m.userId === user.id && m.clubId === clubId);
    const canAccess = isMember || user.id === club.ownerId || user.role === Roles.ADMIN;
    
    if (!canAccess) {
      showToast('Доступ ограничен. Вы должны быть участником клуба для просмотра участников.', 'error');
      Clubs();
      return;
    }
    
    const memberships = db.memberships.filter(m => m.clubId === clubId);
    const members = memberships.map(m => ({
      ...m,
      user: db.users.find(u => u.id === m.userId)
    })).filter(m => m.user);
    
    app().innerHTML = h`
      <div class="actions" style="margin-bottom:12px">
        <a class="btn secondary" href="#/clubs">${t.back}</a>
        ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`<a class="btn" href="#/clubs/${clubId}/members/add">Добавить участника</a>`:''}
        ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`<a class="btn secondary" href="#/clubs/${clubId}/contributions">Ежемесячные взносы</a>`:''}
      </div>
      <div class="card">
        <h2>${t.members} - ${club.name}</h2>
        <table class="table">
          <thead><tr><th>${t.name}</th><th>${t.email}</th><th>Статус</th><th>Дата вступления</th><th>Истекает</th><th>${t.actions}</th></tr></thead>
          <tbody>
            ${members.map(m=>h`<tr>
              <td>${m.user.name}</td>
              <td>${m.user.email}</td>
              <td>${getMembershipStatus(m.userId, clubId) === 'active' ? t.active : t.expired}</td>
              <td>${fmt(m.joinedAt)}</td>
              <td>${m.expiresAt ? fmt(m.expiresAt) : 'Бессрочно'}</td>
              <td class="actions">
                ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`
                  <button class="btn danger" data-remove="${m.userId}">Удалить</button>
                `:''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    app().querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
      const userId = Number(b.getAttribute('data-remove'));
      if (confirm('Удалить участника из клуба?')) {
        db.memberships = db.memberships.filter(m => !(m.userId === userId && m.clubId === clubId));
        showToast('Участник удален', 'success');
        ClubMembers(clubId);
      }
    });
  }

  function ClubMembersAdd(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Only owner or admin can add members
    if (user.id !== club.ownerId && user.role !== Roles.ADMIN) {
      showToast('Только владелец клуба или администратор могут добавлять участников.', 'error');
      go(`/clubs/${clubId}/members`);
      return;
    }
    
    const existingMembers = db.memberships.filter(m => m.clubId === clubId).map(m => m.userId);
    const availableUsers = db.users.filter(u => 
      u.id !== club.ownerId && !existingMembers.includes(u.id)
    );
    
    if (availableUsers.length === 0) {
      showToast('Нет доступных пользователей для добавления', 'warning');
      go(`/clubs/${clubId}/members`);
      return;
    }
    
    app().innerHTML = h`
      <div class="card main-card">
        <h2>Добавить участника в ${club.name}</h2>
        <form id="f">
          <div class="form-group">
            <label>Выберите пользователя</label>
            <select name="userId" class="select" required>
              <option value="">Выберите пользователя...</option>
              ${availableUsers.map(u => h`<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
            </select>
          </div>
          <div class="action-group mixed">
            <button class="btn">Добавить</button>
            <a class="btn tertiary" href="#/clubs/${clubId}/members">${t.cancel}</a>
          </div>
        </form>
      </div>
    `;
    
    $('f').onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const userId = Number(data.userId);
      
      const memberships = db.memberships;
      memberships.push({
        id: nextId(memberships),
        userId: userId,
        clubId: clubId,
        joinedAt: Date.now(),
        expiresAt: null
      });
      db.memberships = memberships;
      
      showToast('Участник успешно добавлен', 'success');
      ClubMembers(clubId);
    };
  }

  function ClubContributions(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Only allow admin or club owner to manage contributions
    if (user.role !== Roles.ADMIN && user.id !== club.ownerId) {
      showToast('Доступ ограничен. Управление взносами доступно только администраторам и владельцам клубов.', 'error');
      ClubMembers(clubId);
      return;
    }
    
    const members = db.memberships.filter(m => m.clubId === clubId).map(m => ({
      ...m,
      user: db.users.find(u => u.id === m.userId)
    })).filter(m => m.user);
    
    const contributions = db.monthlyContributions.filter(c => c.clubId === clubId);
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    
    // Get current month contributions
    const currentMonthContributions = contributions.filter(c => c.month === currentMonth);
    
    // Calculate who has paid and who hasn't
    const membersWithStatus = members.map(member => {
      const hasPaid = currentMonthContributions.some(c => c.userId === member.userId);
      return {
        ...member,
        hasPaid,
        contribution: currentMonthContributions.find(c => c.userId === member.userId)
      };
    });
    
    const paidCount = membersWithStatus.filter(m => m.hasPaid).length;
    const unpaidCount = membersWithStatus.filter(m => !m.hasPaid).length;
    const totalRevenue = currentMonthContributions.reduce((sum, c) => sum + c.amount, 0);
    
    app().innerHTML = h`
      <div class="action-group mixed" style="margin-bottom:12px">
        <a class="btn tertiary" href="#/clubs/${clubId}/members">${t.back}</a>
        <button class="btn" onclick="createMonthlyContribution(${clubId})">Создать взнос за ${new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</button>
      </div>
      <div class="card main-card">
        <h2>Ежемесячные взносы - ${club.name}</h2>
        
        <div class="financial-summary">
          <div class="summary-card income">
            <div class="summary-amount income">${formatCurrency(totalRevenue)}</div>
            <div class="summary-label">Доход за ${new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</div>
          </div>
          <div class="summary-card">
            <div class="summary-amount">${paidCount}</div>
            <div class="summary-label">Оплатили взнос</div>
          </div>
          <div class="summary-card">
            <div class="summary-amount">${unpaidCount}</div>
            <div class="summary-label">Не оплатили взнос</div>
          </div>
        </div>
        
        <h3>Статус взносов за ${new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h3>
        <table class="table">
          <thead><tr><th>Участник</th><th>Email</th><th>Статус</th><th>Дата оплаты</th><th>Сумма</th><th>Действия</th></tr></thead>
          <tbody>
            ${membersWithStatus.map(member => h`<tr>
              <td>${member.user.name}</td>
              <td>${member.user.email}</td>
              <td>
                <span class="badge ${member.hasPaid ? 'badge-paid' : 'badge-unpaid'}">
                  ${member.hasPaid ? 'Оплачено' : 'Не оплачено'}
                </span>
              </td>
              <td>${member.hasPaid ? fmt(member.contribution.paidAt) : '—'}</td>
              <td>${member.hasPaid ? formatCurrency(member.contribution.amount) : formatCurrency(club.membershipFee || 0)}</td>
              <td>
                ${!member.hasPaid ? h`
                  <button class="btn secondary" onclick="markContributionAsPaid(${clubId}, ${member.userId}, ${club.membershipFee || 0})">
                    Отметить как оплачено
                  </button>
                ` : ''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
        
        <h3>История взносов</h3>
        <table class="table">
          <thead><tr><th>Месяц</th><th>Участник</th><th>Сумма</th><th>Дата оплаты</th></tr></thead>
          <tbody>
            ${contributions.slice().sort((a, b) => b.paidAt - a.paidAt).map(contribution => {
              const contributor = db.users.find(u => u.id === contribution.userId);
              return h`<tr>
                <td>${new Date(contribution.month + '-01').toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</td>
                <td>${contributor?.name || 'Неизвестно'}</td>
                <td>${formatCurrency(contribution.amount)}</td>
                <td>${fmt(contribution.paidAt)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function ClubRegister(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Check if already a member
    const existingMembership = db.memberships.find(m => m.userId === user.id && m.clubId === clubId);
    if (existingMembership) {
      showToast('Вы уже являетесь участником этого клуба', 'warning');
      Clubs();
      return;
    }
    
    // Add membership
    const memberships = db.memberships;
    memberships.push({
      id: nextId(memberships),
      userId: user.id,
      clubId: clubId,
      joinedAt: Date.now(),
      expiresAt: null // No expiration
    });
    db.memberships = memberships;
    
    showToast(`Вы успешно зарегистрировались в клубе "${club.name}"`, 'success');
    Clubs();
  }

  function ClubLeave(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Check if user is a member
    const membership = db.memberships.find(m => m.userId === user.id && m.clubId === clubId);
    if (!membership) {
      showToast('Вы не являетесь участником этого клуба', 'warning');
      Clubs();
      return;
    }
    
    // Check if user is the owner
    if (user.id === club.ownerId) {
      showToast('Владелец клуба не может покинуть клуб', 'error');
      Clubs();
      return;
    }
    
    // Remove membership
    db.memberships = db.memberships.filter(m => !(m.userId === user.id && m.clubId === clubId));
    
    showToast(`Вы покинули клуб "${club.name}"`, 'success');
    Clubs();
  }

  function ClubFinances(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Only allow admin or club owner to view finances
    if (user.role !== Roles.ADMIN && user.id !== club.ownerId) {
      showToast('Доступ ограничен. Просмотр финансов доступен только администраторам и владельцам клубов.', 'error');
      Clubs();
      return;
    }
    
    const payments = db.payments.filter(p => p.clubId === clubId);
    const finances = db.finances.filter(f => f.clubId === clubId);
    const balance = calculateClubBalance(clubId);
    const financialStats = generateClubFinancialStatistics(clubId);
    
    app().innerHTML = h`
      <div class="actions" style="margin-bottom:12px">
        <a class="btn secondary" href="#/clubs">${t.back}</a>
        ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`
          <a class="btn" href="#/clubs/${clubId}/finances/add-income">${t.addIncome}</a>
          <a class="btn secondary" href="#/clubs/${clubId}/finances/add-expense">${t.addExpense}</a>
          <button class="btn" onclick="exportFinancialReportToExcel(${clubId}, 'all')">Экспорт в Excel</button>
          <button class="btn secondary" onclick="exportFinancialReportToExcel(${clubId}, 'month')">Экспорт за месяц</button>
        `:''}
      </div>
      <div class="card">
        <h2>${t.finances} - ${club.name}</h2>
        <div class="row">
          <div class="col">
            <h3>${t.balance}: ${formatCurrency(balance)}</h3>
            <p>Общий доход: ${formatCurrency(financialStats.totalIncome)}</p>
            <p>Общие расходы: ${formatCurrency(financialStats.totalExpenses)}</p>
            <p>Средний платеж: ${formatCurrency(financialStats.averagePaymentAmount)}</p>
          </div>
        </div>
        
        <h3>Статистика по участникам</h3>
        <table class="table">
          <thead><tr><th>Участник</th><th>Общая сумма</th><th>Количество платежей</th><th>Последний платеж</th></tr></thead>
          <tbody>
            ${Object.entries(financialStats.contributors).map(([name, data])=>h`<tr>
              <td>${name}</td>
              <td>${formatCurrency(data.totalAmount)}</td>
              <td>${data.paymentCount}</td>
              <td>${fmt(data.lastPayment)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        
        <h3>${t.income}</h3>
        <table class="table">
          <thead><tr><th>Участник</th><th>${t.amount}</th><th>${t.paymentDate}</th><th>${t.paymentStatus}</th></tr></thead>
          <tbody>
            ${payments.map(p=>h`<tr>
              <td>${db.users.find(u=>u.id===p.userId)?.name||'?'}</td>
              <td>${formatCurrency(p.amount)}</td>
              <td>${fmt(p.paidAt)}</td>
              <td>${t.paid}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <h3>${t.expenses}</h3>
        <table class="table">
          <thead><tr><th>Описание</th><th>${t.amount}</th><th>Дата</th></tr></thead>
          <tbody>
            ${finances.filter(f=>f.type==='expense').map(f=>h`<tr>
              <td>${f.description}</td>
              <td>${formatCurrency(f.amount)}</td>
              <td>${fmt(f.date)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Add income for a club (adds to payments)
  function ClubAddIncome(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    if (user.role !== Roles.ADMIN && user.id !== club.ownerId) { Clubs(); return; }

    app().innerHTML = h`
      <div class="actions" style="margin-bottom:12px">
        <a class="btn secondary" href="#/clubs/${clubId}/finances">${t.back}</a>
      </div>
      <div class="card main-card info">
        <h2>Добавить доход — ${club.name}</h2>
        <form id="f">
          <div class="form-group"><label>${t.amount}</label><input name="amount" type="number" class="input" min="1" step="1" required></div>
          <div class="form-group"><label>Описание (необязательно)</label><input name="description" class="input" placeholder="Например: Спонсорская помощь"></div>
          <div class="form-group"><label>Участник (необязательно)</label>
            <select name="userId" class="select">
              <option value="">Без участника</option>
              ${db.users.map(u=>h`<option value="${u.id}">${u.name} (${u.email})</option>`).join('')}
            </select>
          </div>
          <div class="action-group mixed"><button class="btn">${t.addIncome}</button> <a class="btn tertiary" href="#/clubs/${clubId}/finances">${t.cancel}</a></div>
        </form>
      </div>
    `;
    $('f').onsubmit = (e)=>{
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const amount = Number(data.amount);
      if (!(amount > 0)) { showToast('Введите корректную сумму', 'error'); return; }
      const payments = db.payments;
      payments.push({
        id: nextId(payments),
        clubId,
        userId: data.userId ? Number(data.userId) : null,
        amount,
        paidAt: Date.now(),
        type: 'manual_income',
        description: data.description||''
      });
      db.payments = payments;
      showToast('Доход добавлен', 'success');
      ClubFinances(clubId);
    };
  }

  // Add expense for a club (adds to finances with type expense)
  function ClubAddExpense(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    if (user.role !== Roles.ADMIN && user.id !== club.ownerId) { Clubs(); return; }

    app().innerHTML = h`
      <div class="actions" style="margin-bottom:12px">
        <a class="btn secondary" href="#/clubs/${clubId}/finances">${t.back}</a>
      </div>
      <div class="card main-card warning">
        <h2>Добавить расход — ${club.name}</h2>
        <form id="f">
          <div class="form-group"><label>Описание</label><input name="description" class="input" required placeholder="Например: Аренда зала"></div>
          <div class="form-group"><label>${t.amount}</label><input name="amount" type="number" class="input" min="1" step="1" required></div>
          <div class="form-group"><label>Дата</label><input name="date" type="date" class="input" required></div>
          <div class="action-group mixed"><button class="btn">${t.addExpense}</button> <a class="btn tertiary" href="#/clubs/${clubId}/finances">${t.cancel}</a></div>
        </form>
      </div>
    `;
    $('f').onsubmit = (e)=>{
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const amount = Number(data.amount);
      if (!(amount > 0)) { showToast('Введите корректную сумму', 'error'); return; }
      const finances = db.finances;
      finances.push({
        id: nextId(finances),
        clubId,
        type: 'expense',
        description: data.description.trim(),
        amount,
        date: data.date ? new Date(data.date).getTime() : Date.now()
      });
      db.finances = finances;
      showToast('Расход добавлен', 'success');
      ClubFinances(clubId);
    };
  }
  
  function ClubSchedule(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Check if user is a member, owner, or admin
    const isMember = db.memberships.some(m => m.userId === user.id && m.clubId === clubId);
    const canAccess = isMember || user.id === club.ownerId || user.role === Roles.ADMIN;
    
    if (!canAccess) {
      showToast('Доступ ограничен. Вы должны быть участником клуба для просмотра расписания.', 'error');
      Clubs();
      return;
    }
    
    const schedules = db.schedules.filter(s => s.clubId === clubId);
    const days = [t.monday, t.tuesday, t.wednesday, t.thursday, t.friday, t.saturday, t.sunday];
    
    app().innerHTML = h`
      <div class="actions" style="margin-bottom:12px">
        <a class="btn secondary" href="#/clubs">${t.back}</a>
        ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`<a class="btn" href="#/clubs/${clubId}/schedule/add">Добавить расписание</a>`:''}
      </div>
      <div class="card">
        <h2>${t.schedule} - ${club.name}</h2>
        <table class="table">
          <thead><tr><th>${t.dayOfWeek}</th><th>${t.time}</th><th>${t.duration}</th><th>Описание</th><th>${t.actions}</th></tr></thead>
          <tbody>
            ${schedules.map(s=>h`<tr>
              <td>${days[s.dayOfWeek]}</td>
              <td>${s.time}</td>
              <td>${s.duration} мин</td>
              <td>${s.description||''}</td>
              <td class="actions">
                ${(user.id===club.ownerId||user.role===Roles.ADMIN)? h`
                  <a class="btn secondary" href="#/clubs/${clubId}/schedule/${s.id}/edit">${t.edit}</a>
                  <button class="btn danger" data-del="${s.id}">${t.delete}</button>
                `:''}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    
    app().querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
      const id = Number(b.getAttribute('data-del'));
      if (confirm(t.confirmDelete)) {
        db.schedules = db.schedules.filter(s => s.id !== id);
        showToast('Расписание удалено', 'success');
        ClubSchedule(clubId);
      }
    });
  }

  function ClubScheduleAdd(clubId) {
    const user = me(); if(!user){ go('/login'); return; }
    const club = db.clubs.find(c=>c.id===clubId); if(!club){ go('/clubs'); return; }
    
    // Only owner or admin can add schedules
    if (user.id !== club.ownerId && user.role !== Roles.ADMIN) {
      showToast('Только владелец клуба или администратор могут добавлять расписание.', 'error');
      go(`/clubs/${clubId}/schedule`);
      return;
    }
    
    const daysOfWeek = [
      {value: 0, label: t.monday},
      {value: 1, label: t.tuesday},
      {value: 2, label: t.wednesday},
      {value: 3, label: t.thursday},
      {value: 4, label: t.friday},
      {value: 5, label: t.saturday},
      {value: 6, label: t.sunday}
    ];
    
    app().innerHTML = h`
      <div class="card main-card">
        <h2>Добавить расписание для ${club.name}</h2>
        <form id="f">
          <div class="form-group">
            <label>${t.dayOfWeek}</label>
            <select name="dayOfWeek" class="select" required>
              <option value="">Выберите день недели...</option>
              ${daysOfWeek.map(d => h`<option value="${d.value}">${d.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${t.time}</label>
            <input type="time" name="time" class="input" required>
          </div>
          <div class="form-group">
            <label>${t.duration} (мин)</label>
            <input type="number" name="duration" class="input" min="1" required>
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea name="description" class="textarea"></textarea>
          </div>
          <div class="action-group mixed">
            <button class="btn">Добавить</button>
            <a class="btn tertiary" href="#/clubs/${clubId}/schedule">${t.cancel}</a>
          </div>
        </form>
      </div>
    `;
    
    $('f').onsubmit = (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      
      const schedules = db.schedules;
      schedules.push({
        id: nextId(schedules),
        clubId: clubId,
        dayOfWeek: Number(data.dayOfWeek),
        time: data.time,
        duration: Number(data.duration),
        description: data.description || '',
        createdAt: Date.now()
      });
      db.schedules = schedules;
      
      showToast('Расписание успешно добавлено', 'success');
      ClubSchedule(clubId);
    };
  }

  function Statistics() {
    const user = me(); if(!user){ go('/login'); return; }
    
    // Only allow admin to view statistics
    if (user.role !== Roles.ADMIN) {
      showToast('Доступ ограничен. Статистика доступна только администраторам.', 'error');
      Clubs();
      return;
    }
    
    const stats = generateApplicationStatistics();
    
    app().innerHTML = h`
      <div class="action-group primary" style="margin-bottom:12px">
        <button class="btn" onclick="exportStatisticsToExcel()">Экспорт статистики в Excel</button>
      </div>
      
      <div class="card main-card">
        <h2>Общая статистика приложения</h2>
        <div class="row">
          <div class="col">
            <h3>Основные показатели</h3>
            <p><strong>Общее количество клубов:</strong> ${stats.totalClubs}</p>
            <p><strong>Общее количество пользователей:</strong> ${stats.totalUsers}</p>
            <p><strong>Общее количество событий:</strong> ${stats.totalEvents}</p>
            <p><strong>Общее количество участников:</strong> ${stats.totalMemberships}</p>
          </div>
          <div class="col">
            <h3>Финансовые показатели</h3>
            <p><strong>Общий доход:</strong> ${formatCurrency(stats.totalIncome)}</p>
            <p><strong>Общие расходы:</strong> ${formatCurrency(stats.totalExpenses)}</p>
            <p><strong>Общий баланс:</strong> ${formatCurrency(stats.totalBalance)}</p>
            <p><strong>Средний доход на клуб:</strong> ${formatCurrency(stats.averageIncomePerClub)}</p>
          </div>
        </div>
        
        <div class="row">
          <div class="col">
            <h3>Лидеры</h3>
            <p><strong>Самый активный клуб:</strong> ${stats.mostActiveClub}</p>
          </div>
        </div>
        
        <h3>Распределение клубов по владельцам</h3>
        <table class="table">
          <thead><tr><th>Владелец</th><th>Количество клубов</th></tr></thead>
          <tbody>
            ${Object.entries(stats.clubsByOwner).map(([owner, count])=>h`<tr>
              <td>${owner}</td>
              <td>${count}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        
        <h3>События по месяцам</h3>
        <table class="table">
          <thead><tr><th>Месяц</th><th>Количество событий</th></tr></thead>
          <tbody>
            ${Object.entries(stats.eventsByMonth).map(([month, count])=>h`<tr>
              <td>${month}</td>
              <td>${count}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        
        <h3>Доходы по месяцам</h3>
        <table class="table">
          <thead><tr><th>Месяц</th><th>Сумма доходов</th></tr></thead>
          <tbody>
            ${Object.entries(stats.paymentsByMonth).map(([month, amount])=>h`<tr>
              <td>${month}</td>
              <td>${formatCurrency(amount)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        
        <h3>Детальная статистика по клубам</h3>
        <table class="table">
          <thead><tr><th>Клуб</th><th>Владелец</th><th>События</th><th>Участники</th><th>Доход</th><th>Расходы</th><th>Баланс</th></tr></thead>
          <tbody>
            ${db.clubs.map(club=>{
              const clubEvents = db.events.filter(e => e.clubId === club.id).length;
              const clubMembers = db.memberships.filter(m => m.clubId === club.id).length;
              const clubIncome = db.payments.filter(p => p.clubId === club.id).reduce((sum, p) => sum + p.amount, 0);
              const clubExpenses = db.finances.filter(f => f.clubId === club.id && f.type === 'expense').reduce((sum, f) => sum + f.amount, 0);
              const clubBalance = clubIncome - clubExpenses;
              const owner = db.users.find(u => u.id === club.ownerId);
              
              return h`<tr>
                <td>${club.name}</td>
                <td>${owner?.name || 'Неизвестно'}</td>
                <td>${clubEvents}</td>
                <td>${clubMembers}</td>
                <td>${formatCurrency(clubIncome)}</td>
                <td>${formatCurrency(clubExpenses)}</td>
                <td>${formatCurrency(clubBalance)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  const routes = {
    '/': Home, '/register': Register, '/login': Login,
    '/clubs': Clubs, '/clubs/create': ClubCreate, '/clubs/:id/edit': ClubEdit,
    '/clubs/:id/events': Events, '/clubs/:id/events/create': EventCreate,
    '/clubs/:id/events/:eid': EventDetail, '/clubs/:id/events/:eid/edit': EventEdit,
    '/clubs/:id/events/payments': EventPayments,
    '/clubs/:id/members': ClubMembers, '/clubs/:id/members/add': ClubMembersAdd,
    '/clubs/:id/contributions': ClubContributions,
    '/clubs/:id/finances': ClubFinances, '/clubs/:id/finances/add-income': ClubAddIncome, '/clubs/:id/finances/add-expense': ClubAddExpense, '/clubs/:id/schedule': ClubSchedule, '/clubs/:id/schedule/add': ClubScheduleAdd,
    '/statistics': Statistics, '/admin': Admin,
  };
  function go(path){ location.hash = '#'+path; }
  function parts(){ const p=(location.hash||'#').slice(1); return p.split('/').filter(Boolean); }
  function dispatch(){
    setNav();
    const p = parts(); if (p.length===0) return routes['/']();
    const key = '/'+p.join('/'); if (routes[key]) return routes[key]();
    if (p[0]==='clubs' && p.length===2 && p[1]==='create') return routes['/clubs/create']();
    if (p[0]==='clubs' && p.length===2) return routes['/clubs']();
    if (p[0]==='clubs' && p.length===3 && p[2]==='edit') return routes['/clubs/:id/edit'](Number(p[1]));
    if (p[0]==='clubs' && p.length===3 && p[2]==='events') return routes['/clubs/:id/events'](Number(p[1]));
    if (p[0]==='clubs' && p.length===3 && p[2]==='members') return routes['/clubs/:id/members'](Number(p[1]));
    if (p[0]==='clubs' && p.length===3 && p[2]==='contributions') return routes['/clubs/:id/contributions'](Number(p[1]));
    if (p[0]==='clubs' && p.length===3 && p[2]==='finances') return routes['/clubs/:id/finances'](Number(p[1]));
    if (p[0]==='clubs' && p.length===4 && p[2]==='finances' && p[3]==='add-income') return routes['/clubs/:id/finances/add-income'](Number(p[1]));
    if (p[0]==='clubs' && p.length===4 && p[2]==='finances' && p[3]==='add-expense') return routes['/clubs/:id/finances/add-expense'](Number(p[1]));
    if (p[0]==='clubs' && p.length===3 && p[2]==='schedule') return routes['/clubs/:id/schedule'](Number(p[1]));
    if (p[0]==='clubs' && p.length===4 && p[2]==='events' && p[3]==='create') return routes['/clubs/:id/events/create'](Number(p[1]));
    if (p[0]==='clubs' && p.length===4 && p[2]==='events' && p[3]==='payments') return routes['/clubs/:id/events/payments'](Number(p[1]));
    if (p[0]==='clubs' && p.length===4 && p[2]==='events') return routes['/clubs/:id/events/:eid'](Number(p[1]), Number(p[3]));
    if (p[0]==='clubs' && p.length===5 && p[2]==='events' && p[4]==='edit') return routes['/clubs/:id/events/:eid/edit'](Number(p[1]), Number(p[3]));
    if (p[0]==='clubs' && p.length===4 && p[2]==='members' && p[3]==='add') return routes['/clubs/:id/members/add'](Number(p[1]));
    if (p[0]==='clubs' && p.length===4 && p[2]==='schedule' && p[3]==='add') return routes['/clubs/:id/schedule/add'](Number(p[1]));
    if (p[0]==='statistics') return routes['/statistics']();
    if (p[0]==='admin') return routes['/admin']();
    routes['/']();
  }

  seed(); 
  initTheme();
  setNav();
  window.addEventListener('hashchange', dispatch);
  dispatch();
})();
