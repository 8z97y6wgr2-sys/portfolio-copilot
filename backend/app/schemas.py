import re
from datetime import date
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid", str_strip_whitespace=True)


def symbol(value):
    value = value.upper()
    if not re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,15}", value):
        raise ValueError("Usa un símbolo bursátil válido, como AAPL o BRK.B.")
    return value


class Login(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: Annotated[str, StringConstraints(strip_whitespace=False, min_length=12, max_length=128)]

    @field_validator("email")
    @classmethod
    def check_email(cls, value):
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Introduce un correo electrónico válido.")
        return value.lower()

class Register(Login):
    name: str = Field(min_length=1, max_length=80)


class PortfolioInput(StrictModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=400)
    currency: Literal["USD"] = "USD"
    benchmark: str = "SPY"
    annual_rf: float = Field(default=0, gt=-1, le=1)
    _symbol = field_validator("benchmark")(symbol)


class HoldingInput(StrictModel):
    symbol: str
    name: str = Field(default="", max_length=80)
    quantity: float = Field(ge=1e-8, le=1e9)
    average_cost: float = Field(ge=0, le=1e9)
    market_price: float | None = Field(default=None, ge=1e-8, le=1e9)
    price_date: date | None = None
    _symbol = field_validator("symbol")(symbol)

    @model_validator(mode="after")
    def dated_price(self):
        if (self.market_price is None) != (self.price_date is None):
            raise ValueError("Indica precio y fecha juntos, o deja ambos vacíos.")
        if self.price_date and self.price_date > date.today():
            raise ValueError("La fecha del precio no puede estar en el futuro.")
        return self


class AnalysisRequest(StrictModel):
    dates: list[str] = Field(min_length=3, max_length=10000)
    prices: dict[str, list[float]] = Field(min_length=1, max_length=100)
    weights: dict[str, float]
    benchmark: list[float] | None = None
    annual_rf: float = Field(default=0, gt=-1, le=1)


class CsvImport(StrictModel):
    csv: str = Field(min_length=10, max_length=1_000_000)


class RefreshInput(StrictModel):
    days: int = Field(default=365, ge=30, le=1825)
