const Database = (await import('@tauri-apps/plugin-sql')).default;

let db;
let currentDate = new Date().toISOString().split('T')[0];
let calendarDisplayDate = new Date().toISOString().split('T')[0];

async function initDatabase() {
  db = await Database.load('sqlite:dailylog.db');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS days (
      date TEXT PRIMARY KEY,
      log TEXT,
      mood_tags TEXT,
      mood_notes TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      text TEXT,
      completed INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT,
      title TEXT
    )
  `);
  await goToDate(currentDate);
  document.getElementById('log-input').addEventListener('input', saveDay);
  document.getElementById('mood-notes').addEventListener('input', saveDay);
  document.querySelectorAll('.mood-tag').forEach(button => {
  button.addEventListener('click', () => {
      button.classList.toggle('selected');
      saveDay();
    });
  });

  document.getElementById('new-task-input').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const text = e.target.value.trim();
      if (text) {
        await addTask(text);
        e.target.value = '';
      }
    }
  });

  document.getElementById('prev-day').addEventListener('click', () => {
    const date = new Date(currentDate + 'T00:00:00');
    date.setDate(date.getDate() - 1);
    goToDate(date.toISOString().split('T')[0]);
  });

  document.getElementById('next-day').addEventListener('click', () => {
    const date = new Date(currentDate + 'T00:00:00');
    date.setDate(date.getDate() + 1);
    goToDate(date.toISOString().split('T')[0]);
  });
}

async function loadDay(date) {
  const result = await db.select(
    'SELECT * FROM days WHERE date = ?',
    [date]
  );
  
  if (result.length > 0) {
    document.getElementById('log-input').value = result[0].log || '';
    document.getElementById('mood-notes').value = result[0].mood_notes || '';

    const savedMoods = JSON.parse(result[0].mood_tags || '[]');
    document.querySelectorAll('.mood-tag').forEach(button => {
      if (savedMoods.includes(button.dataset.mood)) {
      button.classList.add('selected');
      } else {
        button.classList.remove('selected');
      }
    });
  } else {
    document.getElementById('log-input').value = '';
    document.getElementById('mood-notes').value = '';
  }
  await loadTasks(date);
}

async function saveDay() {
  const selectedMoods = Array.from(document.querySelectorAll('.mood-tag.selected'))
    .map(btn => btn.dataset.mood);

  await db.execute(
    `INSERT INTO days (date, log, mood_notes, mood_tags)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       log = excluded.log,
       mood_notes = excluded.mood_notes,
       mood_tags = excluded.mood_tags`,
    [
      currentDate,
      document.getElementById('log-input').value,
      document.getElementById('mood-notes').value,
      JSON.stringify(selectedMoods)
    ]
  );
}

async function addTask(text) {
  await db.execute(
    'INSERT INTO tasks (date, text, completed, pinned) VALUES (?, ?, 0, 0)',
    [currentDate, text]
  );
  await loadTasks(currentDate);
}

async function loadTasks(date) {
  const tasks = await db.select(
    'SELECT * FROM tasks WHERE date = ?',
    [date]
  );

  const tasksList = document.getElementById('tasks-list');
  tasksList.innerHTML = '';

  tasks.forEach(task => {
    const taskEl = document.createElement('div');
    taskEl.className = 'task-item';
    taskEl.innerHTML = `
      <input type="checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}" class="task-checkbox" />
      <span class="task-text ${task.completed ? 'completed' : ''}" contenteditable="true" data-id="${task.id}">${task.text}</span>
      <button class="pin-btn ${task.pinned ? 'pinned' : ''}" data-id="${task.id}">⚲</button>
      <button class="delete-btn" data-id="${task.id}">×</button>
    `;
    tasksList.appendChild(taskEl);

    taskEl.querySelector('.delete-btn').addEventListener('click', async () => {
      await db.execute('DELETE FROM tasks WHERE id = ?', [task.id]);
      await loadTasks(currentDate);
    });

    taskEl.querySelector('.pin-btn').addEventListener('click', async () => {
      await db.execute(
        'UPDATE tasks SET pinned = ? WHERE id = ?',
        [task.pinned ? 0 : 1, task.id]
      );
      await loadTasks(currentDate);
    });

    taskEl.querySelector('.task-text').addEventListener('blur', async () => {
      const newText = taskEl.querySelector('.task-text').innerText.trim();
      await db.execute(
        'UPDATE tasks SET text = ? WHERE id = ?',
        [newText, task.id]
      );
    });

    taskEl.querySelector('.task-checkbox').addEventListener('change', async (e) => {
      await db.execute(
        'UPDATE tasks SET completed = ? WHERE id = ?',
        [e.target.checked ? 1 : 0, task.id]
      );
      await loadTasks(currentDate);
    });
  });
}

function formatDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

async function goToDate(date) {
  currentDate = date;
  document.getElementById('current-date-label').textContent = formatDate(date);
  await loadDay(date);
  renderCalender(currentDate);
  calendarDisplayDate = currentDate;
  renderWeeklyView(date);
}

async function renderCalender(dateString, displayDate = dateString) {
  const date = dateString.split('-');
  const year = date[0];
  const month = date[1];
  const numdays = new Date(year, month, 0).getDate();
  const startday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const today = new Date().toISOString().split('T')[0];

  const calendar = document.getElementById('monthly-calendar');
  calendar.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'cal-header';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '←';
  prevBtn.className = 'cal-nav-btn';
  prevBtn.addEventListener('click', () => {
    const d = new Date(year, month - 2, 1);
    calendarDisplayDate = d.toISOString().split('T')[0];
    renderCalender(calendarDisplayDate);
  });

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '→';
  nextBtn.className = 'cal-nav-btn';
  nextBtn.addEventListener('click', () => {
    const d = new Date(year, month, 1);
    calendarDisplayDate = d.toISOString().split('T')[0];
    renderCalender(calendarDisplayDate);
  });

  const title = document.createElement('span');
  title.textContent = new Date(year, month - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  header.appendChild(prevBtn);
  header.appendChild(title);
  header.appendChild(nextBtn);
  calendar.appendChild(header);

  const labels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const labelRow = document.createElement('div');
  labelRow.className = 'cal-labels';
  labels.forEach(l => {
    const cell = document.createElement('span');
    cell.textContent = l;
    labelRow.appendChild(cell);
  });
  calendar.appendChild(labelRow);

  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  for (let i = 0; i < startday; i++) {
    const empty = document.createElement('span');
    grid.appendChild(empty);
  }

  for (let d = 1; d <= numdays; d++) {
    const btn = document.createElement('button');
    btn. textContent = d;
    btn.className = 'cal-day';

    const thisDate = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (thisDate === currentDate) {
      btn.classList.add('selected-day');
    } else if (thisDate === today) {
      btn.classList.add('today');
    }
    grid.appendChild(btn);
    btn.addEventListener('click', () => {
      goToDate(thisDate)
    })
  }

  calendar.appendChild(grid);
}

async function getMonday(dateString) {
  const date = dateString.split('-');
  const year = date[0];
  const month = date[1];
  const curday = date[2].split('T')[0];

  const dayofweek = new Date(year, month - 1, curday).getDay();
  const offset = (Number(dayofweek) + 6) % 7;

  return new Date(year, month -1, curday - offset)
}

async function renderWeeklyView(dateString) {
  const monday = await getMonday(dateString);
  const weeklyView = document.getElementById('weekly-view');
  weeklyView.innerHTML = '';

  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dayString = day.toISOString().split('T')[0];

    const dayEl = document.createElement('div');
    dayEl.className = 'week-day';
    if (dayString === dateString) dayEl.classList.add('week-day-selected');

    const label = document.createElement('div');
    label.className = 'week-day-label';
    label.textContent = day.toLocaleDateString('en-US', {weekday: 'short', day: 'numeric'});

    dayEl.appendChild(label);
    dayEl.addEventListener('click', () => goToDate(dayString));
    weeklyView.appendChild(dayEl)
  }
}



initDatabase();



