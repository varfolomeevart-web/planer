'use client'

// Глобальная страница ошибки: показывается, если в браузере возникло
// неперехваченное исключение (например, сбой загрузки чанка при плохой сети).
// Заменяет английскую «Application error» на понятный русский экран.

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isChunkError =
    typeof error?.message === 'string' &&
    /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(error.message)

  const reload = () => {
    try {
      sessionStorage.removeItem('rp_chunk_reload')
    } catch {}
    window.location.reload()
  }

  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#FAF6F0',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            background: '#FFFFFF',
            border: '1px solid #EFE8DB',
            borderRadius: 16,
            padding: 28,
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 18, margin: '0 0 8px', color: '#2B2118' }}>Не удалось загрузить планировщик</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: '#6B5D4F', margin: '0 0 20px' }}>
            {isChunkError
              ? 'Часть данных приложения не загрузилась — вероятно, проблема с соединением. Проверьте интернет и попробуйте ещё раз.'
              : 'Произошла непредвиденная ошибка. Обычно помогает перезагрузка страницы.'}
          </p>
          <button
            onClick={reload}
            style={{
              background: '#E8730C',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 22px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Перезагрузить страницу
          </button>
        </div>
      </body>
    </html>
  )
}
