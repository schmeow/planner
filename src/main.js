const Database = (await import('@tauri-apps/plugin-sql')).default;

let db;
let currentDate = new Date().toISOString().split('T')[0];

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
}



initDatabase();



