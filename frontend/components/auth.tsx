"use client";
import { FormEvent, useState } from "react";
import { api, User } from "../lib/api";
import { Brand, Icon } from "./icons";
export function Auth({ done }: { done: (user: User) => void }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      done(
        await api<User>("/auth/" + (register ? "register" : "login"), "POST", {
          email: f.get("email"),
          password: f.get("password"),
          ...(register ? { name: f.get("name") } : {}),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-copy">
          <div className="eyebrow">CLARIDAD PARA TU CAPITAL</div>
          <h1>
            Una visión más
            <br />
            completa de
            <br />
            <em>tus inversiones.</em>
          </h1>
          <p>
            Reúne tus posiciones. Comprende el riesgo.
            <br />
            Dale perspectiva a cada decisión.
          </p>
          <div className="story-chart" aria-hidden="true">
            <div>
              CONSTRUYE TU PERSPECTIVA <span>↗</span>
            </div>
            <svg viewBox="0 0 500 130">
              <path
                d="M0 110 35 100 65 107 100 79 130 92 170 68 200 75 230 40 270 55 310 28 350 40 390 15 430 24 470 4 500 13"
                fill="none"
                stroke="#bacd95"
                strokeWidth="2"
              />
              <path d="M0 130H500M0 65H500M0 0H500" stroke="#ffffff14" />
            </svg>
            <small>Una herramienta para analizar y aprender.</small>
          </div>
        </div>
        <span className="auth-footer">
          EA Inversión · Tu capital, con perspectiva.
        </span>
      </section>
      <section className="auth-form-area">
        <div className="auth-form">
          <span className="pill">TU ESPACIO DE INVERSIÓN</span>
          <h2>{register ? "Empieza con claridad." : "Bienvenido de nuevo."}</h2>
          <p>
            {register
              ? "Crea tu cuenta para guardar y analizar tus carteras."
              : "Entra para continuar con tus portafolios."}
          </p>
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              {register && (
                <label>
                  Nombre
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    maxLength={80}
                    placeholder="Tu nombre"
                  />
                </label>
              )}
              <label>
                Correo electrónico
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="nombre@correo.com"
                />
              </label>
              <label>
                Contraseña
                <input
                  name="password"
                  type="password"
                  autoComplete={register ? "new-password" : "current-password"}
                  required
                  minLength={12}
                  maxLength={128}
                  placeholder="Mínimo 12 caracteres"
                />
              </label>
              <button className="primary full" type="submit">
                {busy
                  ? "Un momento…"
                  : register
                    ? "Crear mi cuenta"
                    : "Entrar a mi espacio"}
                <Icon name="arrow" />
              </button>
            </fieldset>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="switch-auth">
            {register ? "¿Ya tienes cuenta?" : "¿Primera vez aquí?"}{" "}
            <button
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Inicia sesión" : "Crea tu cuenta"}
            </button>
          </p>
          <a className="lab-link" href="/lab">
            Explorar el laboratorio CSV sin cuenta <span>↗</span>
          </a>
          <div className="auth-features">
            <span>◌ Carteras guardadas</span>
            <span>◌ Riesgo en contexto</span>
          </div>
        </div>
      </section>
    </main>
  );
}
