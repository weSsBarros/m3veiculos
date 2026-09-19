import './SetupNotice.css'

export default function SetupNotice() {
  return (
    <div className="setup-notice">
      <div className="setup-notice-box">
        <h2>Conecte o Supabase para continuar</h2>
        <p>
          Este site busca os carros de um banco de dados Supabase. Crie um arquivo{' '}
          <code>.env</code> na raiz do projeto (baseado no <code>.env.example</code>) com a URL e a
          chave <code>anon</code> do seu projeto, rode o script <code>supabase/schema.sql</code> no
          SQL Editor do Supabase e reinicie o servidor.
        </p>
      </div>
    </div>
  )
}
