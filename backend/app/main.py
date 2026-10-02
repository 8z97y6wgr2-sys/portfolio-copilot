"""EA Inversión API. Analysis is isolated in engine.py."""
import csv
import io
from datetime import date, timedelta
from typing import Literal
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .auth import COOKIE, DUMMY_HASH, PASSWORDS, current_user, db_session, digest, public_user, start_session, throttle
from .config import Settings
from .db import Holding, LoginSession, Portfolio, User, connect
from .demo import seed_demo
from .engine import analyze
from .market import MarketError, TwelveData, cached_series
from .portfolios import now_iso, owned, parse_csv, portfolio_view, positions
from .schemas import AnalysisRequest, CsvImport, HoldingInput, Login, PortfolioInput, RefreshInput, Register


class RequestGuard:
    def __init__(self, app, settings):
        self.app, self.settings = app, settings

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = dict(scope['headers'])
        unsafe = scope['method'] not in ('GET', 'HEAD', 'OPTIONS')
        if unsafe and scope['path'].startswith('/api/'):
            if headers.get(b'origin', b'').decode() != self.settings.app_origin:
                return await JSONResponse({'detail': 'Origen de la solicitud no permitido.'}, 403)(scope, receive, send)
        messages, total = [], 0
        if unsafe:
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                total += len(message.get('body', b''))
                if total > self.settings.max_body_bytes:
                    return await JSONResponse({'detail': 'Archivo demasiado grande.'}, 413)(scope, receive, send)
                messages.append(message)
                if not message.get('more_body', False):
                    break
            if total and headers.get(b'content-type', b'').split(b';')[0] != b'application/json':
                return await JSONResponse({'detail': 'Usa contenido JSON.'}, 415)(scope, receive, send)

        async def replay():
            return messages.pop(0) if messages else await receive()

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] = list(message['headers']) + [(b'cache-control', b'no-store'), (b'x-content-type-options', b'nosniff')]
            await send(message)
        await self.app(scope, replay, secure_send)


def create_app(settings=None, provider=None):
    settings = settings or Settings()
    app = FastAPI(title='EA Inversión · Portfolio Copilot', version='0.2.0')
    app.state.settings = settings
    app.state.engine, app.state.db = connect(settings.database_url)
    app.state.provider = provider or TwelveData(settings.market_api_key)
    app.add_middleware(RequestGuard, settings=settings)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_, exc):
        errors = [{'field': '.'.join(str(i) for i in e['loc'][1:]), 'message': e['msg']} for e in exc.errors()]
        return JSONResponse({'detail': 'Revisa los campos indicados y los límites permitidos.', 'errors': errors}, 422)

    @app.get('/health')
    def health():
        return {'status': 'ok'}

    @app.post('/api/auth/register', status_code=201)
    def register(payload: Register, response: Response, request: Request, db: Session = Depends(db_session)):
        throttle(db, request, payload.email)
        user = User(name=payload.name, email=payload.email, password_hash=PASSWORDS.hash(payload.password))
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, 'No se pudo crear la cuenta con ese correo. Prueba iniciar sesión.') from None
        start_session(db, response, request, user)
        return public_user(user)

    @app.post('/api/auth/login')
    def login(payload: Login, response: Response, request: Request, db: Session = Depends(db_session)):
        throttle(db, request, payload.email)
        user = db.scalar(select(User).where(User.email == payload.email))
        verified = PASSWORDS.verify(payload.password, user.password_hash if user else DUMMY_HASH)
        if not user or not verified:
            raise HTTPException(401, 'Correo o contraseña incorrectos.')
        start_session(db, response, request, user)
        return public_user(user)

    @app.post('/api/auth/logout', status_code=204)
    def logout(request: Request, response: Response, db: Session = Depends(db_session)):
        db.execute(delete(LoginSession).where(LoginSession.token_hash == digest(request.cookies.get(COOKIE, ''))))
        db.commit()
        response.delete_cookie(COOKIE, path='/', secure=settings.cookie_secure, httponly=True, samesite='lax')

    @app.get('/api/auth/me')
    def me(user=Depends(current_user)):
        return public_user(user)

    @app.post('/api/analyze')
    def analyze_portfolio(payload: AnalysisRequest):
        try:
            return analyze(**payload.model_dump())
        except (ValueError, OverflowError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get('/api/market/status')
    def market_status(user=Depends(current_user)):
        return {'provider': 'Twelve Data', 'configured': bool(settings.market_api_key), 'currency': 'USD',
                'cache_seconds': 21600, 'note': 'Cierres diarios; requiere clave y acceso a los símbolos de tu cartera.'}

    def room_for_portfolio(db, user):
        if db.scalar(select(func.count()).select_from(Portfolio).where(Portfolio.user_id == user.id)) >= 30:
            raise HTTPException(422, 'Máximo 30 portafolios por cuenta.')

    @app.get('/api/portfolios')
    def list_portfolios(user=Depends(current_user), db: Session = Depends(db_session)):
        rows = db.scalars(select(Portfolio).where(Portfolio.user_id == user.id).order_by(Portfolio.created_at))
        return [{'id': p.id, 'name': p.name, 'description': p.description, 'currency': p.currency} for p in rows]

    @app.post('/api/portfolios', status_code=201)
    def create_portfolio(payload: PortfolioInput, user=Depends(current_user), db: Session = Depends(db_session)):
        room_for_portfolio(db, user)
        p = Portfolio(user_id=user.id, created_at=now_iso(), **payload.model_dump())
        db.add(p)
        db.commit()
        return portfolio_view(db, p)

    @app.post('/api/portfolios/demo', status_code=201)
    def create_demo(user=Depends(current_user), db: Session = Depends(db_session)):
        room_for_portfolio(db, user)
        p = seed_demo(db, user.id)
        db.commit()
        return portfolio_view(db, p)

    @app.get('/api/portfolios/{portfolio_id}')
    def get_portfolio(portfolio_id: str, period: Literal['ALL', '1M', '3M', '6M', '1Y'] = 'ALL', user=Depends(current_user), db: Session = Depends(db_session)):
        return portfolio_view(db, owned(db, user.id, portfolio_id), period)

    @app.put('/api/portfolios/{portfolio_id}')
    def update_portfolio(portfolio_id: str, payload: PortfolioInput, user=Depends(current_user), db: Session = Depends(db_session)):
        p = owned(db, user.id, portfolio_id)
        if payload.benchmark != p.benchmark:
            p.dataset = None
        for key, value in payload.model_dump().items():
            setattr(p, key, value)
        db.commit()
        return portfolio_view(db, p)

    @app.delete('/api/portfolios/{portfolio_id}', status_code=204)
    def delete_portfolio(portfolio_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
        db.delete(owned(db, user.id, portfolio_id))
        db.commit()

    def save_holding(db, p, payload, holding=None):
        other = db.scalar(select(Holding).where(Holding.portfolio_id == p.id, Holding.symbol == payload.symbol))
        if other and (not holding or other.id != holding.id):
            raise HTTPException(409, 'Ese activo ya existe. Edita su posición.')
        if not holding and len(positions(db, p.id)) >= 20:
            raise HTTPException(422, 'Máximo 20 activos por portafolio.')
        if not holding or holding.symbol != payload.symbol:
            p.dataset = None
        h = holding or Holding(portfolio_id=p.id)
        symbol_changed = holding is not None and holding.symbol != payload.symbol
        previous_price = (h.market_price, h.price_date)
        for key, value in payload.model_dump(mode='json').items():
            setattr(h, key, value)
        h.name = h.name or h.symbol
        if not holding or symbol_changed or previous_price != (h.market_price, h.price_date):
            h.price_source = 'Precio manual' if h.market_price is not None else None
        db.add(h)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, 'Ese activo ya existe en la cartera.') from None
        return portfolio_view(db, p)

    @app.post('/api/portfolios/{portfolio_id}/holdings', status_code=201)
    def add_holding(portfolio_id: str, payload: HoldingInput, user=Depends(current_user), db: Session = Depends(db_session)):
        return save_holding(db, owned(db, user.id, portfolio_id), payload)

    @app.put('/api/portfolios/{portfolio_id}/holdings/{holding_id}')
    def update_holding(portfolio_id: str, holding_id: str, payload: HoldingInput, user=Depends(current_user), db: Session = Depends(db_session)):
        p = owned(db, user.id, portfolio_id)
        h = db.scalar(select(Holding).where(Holding.id == holding_id, Holding.portfolio_id == p.id))
        if not h:
            raise HTTPException(404, 'Posición no encontrada.')
        return save_holding(db, p, payload, h)

    @app.delete('/api/portfolios/{portfolio_id}/holdings/{holding_id}', status_code=204)
    def delete_holding(portfolio_id: str, holding_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
        p = owned(db, user.id, portfolio_id)
        h = db.scalar(select(Holding).where(Holding.id == holding_id, Holding.portfolio_id == p.id))
        if not h:
            raise HTTPException(404, 'Posición no encontrada.')
        db.delete(h)
        p.dataset = None
        db.commit()

    @app.post('/api/portfolios/{portfolio_id}/history')
    def import_history(portfolio_id: str, payload: CsvImport, user=Depends(current_user), db: Session = Depends(db_session)):
        p = owned(db, user.id, portfolio_id)
        holdings = positions(db, p.id)
        if not holdings:
            raise HTTPException(422, 'Agrega tus posiciones antes de importar el histórico.')
        try:
            dataset = parse_csv(payload.csv, [h.symbol for h in holdings])
        except (ValueError, OverflowError, csv.Error) as exc:
            raise HTTPException(422, str(exc)) from None
        p.dataset = dataset
        db.commit()
        return portfolio_view(db, p)

    @app.post('/api/portfolios/{portfolio_id}/refresh')
    def refresh(portfolio_id: str, payload: RefreshInput, request: Request, user=Depends(current_user), db: Session = Depends(db_session)):
        p = owned(db, user.id, portfolio_id)
        holdings = positions(db, p.id)
        if not holdings:
            raise HTTPException(422, 'Agrega al menos una posición.')
        end = date.today() - timedelta(days=1)
        start = end - timedelta(days=payload.days)
        try:
            symbols = sorted({h.symbol for h in holdings} | {p.benchmark})
            fetched = {s: cached_series(db, request.app.state.provider, s, start.isoformat(), end.isoformat()) for s in symbols}
            first_dates = fetched[symbols[0]]['dates']
            if any(item['dates'] != first_dates for item in fetched.values()):
                raise MarketError('Las fechas de los activos no coinciden. Usa un periodo común y revisa los datos antes de analizar.')
            p.dataset = {'dates': first_dates, 'prices': {h.symbol: fetched[h.symbol]['prices'] for h in holdings},
                         'benchmark': fetched[p.benchmark]['prices'], 'source': 'Twelve Data', 'kind': 'market',
                         'currency': 'USD', 'updated_at': now_iso(), 'note': 'Histórico ajustado por dividendos y splits; valoración con cierre sin ajustar.'}
            for h in holdings:
                h.market_price = fetched[h.symbol]['raw_price']
                h.price_date = fetched[h.symbol]['raw_date']
                h.price_source = 'Twelve Data'
            view = portfolio_view(db, p)
            db.commit()
            return view
        except (MarketError, ValueError, OverflowError) as exc:
            db.rollback()
            raise HTTPException(503, str(exc)) from None

    @app.get('/api/portfolios/{portfolio_id}/export')
    def export_portfolio(portfolio_id: str, user=Depends(current_user), db: Session = Depends(db_session)):
        p = owned(db, user.id, portfolio_id)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['symbol', 'quantity', 'average_cost', 'market_price', 'price_date', 'currency'])
        for h in positions(db, p.id):
            writer.writerow([h.symbol, h.quantity, h.average_cost, h.market_price, h.price_date, p.currency])
        return Response(output.getvalue(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="posiciones.csv"'})

    return app


app = create_app()
