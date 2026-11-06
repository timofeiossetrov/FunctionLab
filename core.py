"""Ядро FunctionLab: парсинг и вычисление математических функций."""

from __future__ import annotations

import numpy as np
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)

# Разрешённые имена: переменная x и математические функции/константы.
_ALLOWED_NAMES = {
    "x": sp.Symbol("x"),
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "sinh": sp.sinh,
    "cosh": sp.cosh,
    "tanh": sp.tanh,
    "exp": sp.exp,
    "log": sp.log,
    "ln": sp.log,
    "sqrt": sp.sqrt,
    "abs": sp.Abs,
    "pi": sp.pi,
    "e": sp.E,
}

_TRANSFORMATIONS = standard_transformations + (
    implicit_multiplication_application,  # "2x" -> "2*x"
    convert_xor,                          # "x^2" -> "x**2"
)


class ExpressionError(ValueError):
    """Ошибка разбора или вычисления пользовательского выражения."""


def parse_expression(expr: str) -> sp.Expr:
    """Безопасно парсит математическое выражение в объект SymPy.

    Args:
        expr: Строка выражения, например "sin(x) * exp(-x/5)".

    Returns:
        Символьное выражение SymPy, зависящее только от переменной x.

    Raises:
        ExpressionError: Если выражение пустое, содержит недопустимые
            символы, неизвестные функции или лишние переменные.

    Examples:
        >>> parse_expression("x^2 + 2x")
        x**2 + 2*x
    """
    if not expr or not expr.strip():
        raise ExpressionError("Пустое выражение.")

    try:
        parsed = parse_expr(
            expr,
            local_dict=_ALLOWED_NAMES,
            transformations=_TRANSFORMATIONS,
            evaluate=True,
        )
    except Exception as exc:  # SymPy кидает разные типы исключений
        raise ExpressionError(f"Не удалось разобрать выражение: {exc}") from exc

    # Проверяем, что кроме x нет посторонних свободных символов
    free = parsed.free_symbols - {_ALLOWED_NAMES["x"]}
    if free:
        raise ExpressionError(
            f"Недопустимые переменные: {', '.join(str(s) for s in free)}"
        )
    return parsed


def evaluate_expression(expr: str, x_min: float, x_max: float, points: int = 1000):
    """Вычисляет значения функции на равномерной сетке.

    Args:
        expr: Строка выражения.
        x_min: Левая граница диапазона.
        x_max: Правая граница диапазона (должна быть больше x_min).
        points: Количество точек сетки (10..10000).

    Returns:
        Кортеж (xs, ys) — два списка чисел (float). В точках разрыва
        (например, деление на ноль) значение заменяется на None, чтобы
        Plotly корректно разрывал линию.

    Raises:
        ExpressionError: При ошибке парсинга или неверных границах.
    """
    if x_max <= x_min:
        raise ExpressionError("Правая граница должна быть больше левой.")
    points = max(10, min(int(points), 10000))

    parsed = parse_expression(expr)
    func = sp.lambdify(_ALLOWED_NAMES["x"], parsed, modules=["numpy"])

    xs = np.linspace(x_min, x_max, points)
    with np.errstate(all="ignore"):
        ys = func(xs)

    # Приводим к массиву (константные функции дают скаляр)
    ys = np.broadcast_to(ys, xs.shape).astype(float, copy=False)

    xs_list, ys_list = [], []
    for xv, yv in zip(xs, ys):
        xs_list.append(float(xv))
        if not np.isfinite(yv):
            ys_list.append(None)  # разрыв графика
        else:
            ys_list.append(float(yv))
    return xs_list, ys_list