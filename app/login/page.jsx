'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(event) {
    event.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, senha }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || 'Não foi possível entrar.');
      }

      window.location.assign('/');
    } catch (error) {
      setErro(error.message || 'Não foi possível entrar.');
      setCarregando(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="brand-mark">SZ</div>
          <div>
            <div className="brand-name">Discador EVS</div>
            <div className="brand-sub">Equipe que Vende Sozinha</div>
          </div>
        </div>

        <div className="login-kicker">Área restrita</div>
        <h1 id="login-title">Acesse o seu painel</h1>
        <p className="login-intro">
          Entre para acessar a fila de leads e o histórico do Discador EVS.
        </p>

        <form className="login-form" onSubmit={entrar}>
          <label>
            Usuário
            <input
              type="text"
              value={login}
              onChange={(event) => setLogin(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {erro && <div className="login-error">{erro}</div>}

          <button className="login-submit" type="submit" disabled={carregando}>
            {carregando ? 'Entrando…' : 'Entrar no painel'}
          </button>
        </form>

        <div className="login-security">
          <span aria-hidden="true">●</span>
          Sessão protegida e encerrada automaticamente após 8 horas.
        </div>
      </section>

      <div className="login-footer">Base_Geral · Discador EVS</div>
    </main>
  );
}
