"""Flask-приложение FunctionLab Web."""

from flask import Flask, jsonify, render_template, request

from core import ExpressionError, evaluate_expression

app = Flask(__name__)


@app.get("/")
def index():
    """Отдаёт главную страницу приложения."""
    return render_template("index.html")


@app.post("/api/plot")
def api_plot():
    """API построения графика.

    Ожидает JSON:
        {
            "expr": "sin(x)",
            "x_min": -10,
            "x_max": 10,
            "points": 1000
        }

    Возвращает:
        {"expr": ..., "x": [...], "y": [...]}  — при успехе (200)
        {"error": "текст ошибки"}              — при ошибке (400)
    """
    data = request.get_json(silent=True) or {}

    expr = str(data.get("expr", "")).strip()
    try:
        x_min = float(data.get("x_min", -10))
        x_max = float(data.get("x_max", 10))
        points = int(data.get("points", 1000))
    except (TypeError, ValueError):
        return jsonify({"error": "Некорректные числовые параметры."}), 400

    try:
        xs, ys = evaluate_expression(expr, x_min, x_max, points)
    except ExpressionError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        # Не раскрываем внутренние детали клиенту
        app.logger.exception("Unexpected error while plotting")
        return jsonify({"error": "Внутренняя ошибка сервера."}), 500

    return jsonify({"expr": expr, "x": xs, "y": ys})


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)