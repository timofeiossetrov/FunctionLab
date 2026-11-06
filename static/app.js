"use strict";

const form = document.getElementById("plot-form");
const errorBox = document.getElementById("error");
const plotDiv = document.getElementById("plot");
const saveBtn = document.getElementById("save-btn");
const saveMenu = document.getElementById("save-menu");
const container = document.getElementById("functions-container");
const addBtn = document.getElementById("add-btn");

// Палитра цветов для графиков (до 5 штук)
const COLORS = ["#3e7bfa", "#e63946", "#2a9d8f", "#f4a261", "#9b5de5"];
const MAX_FUNCTIONS = 5;

// --- Логика добавления/удаления полей ---

function createFunctionRow(value = "", colorIndex = 0) {
  const row = document.createElement("div");
  row.className = "function-row";
  
  const dot = document.createElement("div");
  dot.className = "color-dot";
  dot.style.backgroundColor = COLORS[colorIndex % COLORS.length];
  
  const input = document.createElement("input");
  input.type = "text";
  input.name = "expr";
  input.value = value;
  input.placeholder = "например: cos(x)";
  input.required = true;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "btn-remove";
  removeBtn.textContent = "Удалить";
  removeBtn.onclick = () => {
    row.remove();
    updateRemoveButtons();
    updateAddButton();
  };

  row.appendChild(dot);
  row.appendChild(input);
  row.appendChild(removeBtn);
  
  return row;
}

function updateRemoveButtons() {
  const rows = container.querySelectorAll(".function-row");
  // Скрываем кнопку "Удалить" у первого поля, чтобы нельзя было удалить всё
  rows.forEach((row, index) => {
    const btn = row.querySelector(".btn-remove");
    btn.style.display = index === 0 ? "none" : "block";
  });
}

function updateAddButton() {
  const count = container.querySelectorAll(".function-row").length;
  addBtn.disabled = count >= MAX_FUNCTIONS;
  addBtn.textContent = addBtn.disabled 
    ? `Максимум ${MAX_FUNCTIONS} функций` 
    : "+ Добавить функцию";
}

// Инициализация первого поля
container.appendChild(createFunctionRow("sin(x) * exp(-x/5)", 0));
updateRemoveButtons();
updateAddButton();

// Обработчик кнопки добавления
addBtn.addEventListener("click", () => {
  const count = container.querySelectorAll(".function-row").length;
  if (count < MAX_FUNCTIONS) {
    container.appendChild(createFunctionRow("", count));
    updateRemoveButtons();
    updateAddButton();
  }
});

// --- Построение графиков ---

async function plotFunctions(payload) {
  errorBox.hidden = true;
  
  // Очищаем график перед новым построением, чтобы старые линии не висели
  Plotly.purge(plotDiv);

  // Отправляем запросы параллельно для всех функций
  const promises = payload.functions.map((expr, index) => 
    fetch("/api/plot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        expr: expr,
        x_min: payload.x_min,
        x_max: payload.x_max,
        points: payload.points
      })
    }).then(async (resp) => {
      const data = await resp.json();
      return { ...data, index, ok: resp.ok };
    })
  );

  const results = await Promise.all(promises);

  // Проверяем, были ли ошибки
  const errors = results.filter(r => !r.ok);
  if (errors.length > 0) {
    errorBox.innerHTML = errors.map(e => `<div>• ${e.expr || 'Ошибка'}: ${e.error}</div>`).join("");
    errorBox.hidden = false;
    // Даже если есть ошибка, отрисуем те графики, что построились успешно
    if (!results.some(r => r.ok)) return;
  }

  // Формируем трейсы для Plotly
  const traces = results.filter(r => r.ok).map((res) => ({
    x: res.x,
    y: res.y,
    type: "scatter",
    mode: "lines",
    name: `f(x) = ${res.expr}`,
    line: { width: 2, color: COLORS[res.index % COLORS.length] },
    connectgaps: false,
  }));

  const layout = {
    margin: { t: 40, r: 20, b: 40, l: 50 },
    xaxis: { title: "x", zeroline: true, gridcolor: "#eee" },
    yaxis: { title: "f(x)", zeroline: true, gridcolor: "#eee" },
    hovermode: "x unified",
    showlegend: true,
    legend: { x: 1, xanchor: 'right', y: 1 }
  };

  Plotly.react(plotDiv, traces, layout, { responsive: true });
  saveBtn.disabled = false;
}

// Обработка отправки формы
form.addEventListener("submit", (event) => {
  event.preventDefault();
  
  const fd = new FormData(form);
  const functions = fd.getAll("expr");
  const x_min = parseFloat(fd.get("x_min"));
  const x_max = parseFloat(fd.get("x_max"));
  const points = parseInt(fd.get("points"), 10) || 1000;

  plotFunctions({ functions, x_min, x_max, points });
});

// --- Логика выпадающего меню и сохранения (без изменений) ---

saveBtn.addEventListener("click", (e) => {
  e.preventDefault();
  saveMenu.style.display = saveMenu.style.display === "block" ? "none" : "block";
});

document.addEventListener("click", (e) => {
  if (!saveBtn.contains(e.target) && !saveMenu.contains(e.target)) {
    saveMenu.style.display = "none";
  }
});

saveMenu.addEventListener("click", async (e) => {
  if (e.target.tagName !== "A") return;
  e.preventDefault();
  saveMenu.style.display = "none";

  const format = e.target.dataset.format;
  const safeName = "functionlab_graph"; // Упростим имя файла

  if (format === "png") {
    Plotly.downloadImage(plotDiv, {
      format: "png",
      width: 1200,
      height: 800,
      filename: safeName,
    });
  } else if (format === "html") {
    const figData = plotDiv.data || [];
    const figLayout = plotDiv.layout || {};
    
    const fullHtmlDoc = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>FunctionLab: График</title>
        <script src="https://cdn.plot.ly/plotly-2.32.0.min.js"><\/script>
      </head>
      <body style="margin:0; padding:20px; font-family:sans-serif;">
        <h2>Графики функций</h2>
        <div id="graph" style="width: 100%; height: 800px;"></div>
        <script>
          const data = ${JSON.stringify(figData)};
          const layout = ${JSON.stringify(figLayout)};
          Plotly.newPlot('graph', data, layout, {responsive: true});
        <\/script>
      </body>
      </html>
    `;
    
    const blob = new Blob([fullHtmlDoc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
});

// Первичное построение при загрузке
form.requestSubmit();