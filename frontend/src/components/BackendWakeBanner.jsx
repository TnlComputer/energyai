import { useEffect, useState } from 'react'
import { useLocale } from '../context/LocaleContext'
import { BACKEND_WAKE_EVENT } from '../services/api'

function BackendWakeBanner() {
  const { t } = useLocale()
  const [waking, setWaking] = useState(false)

  useEffect(() => {
    function onWake(event) {
      setWaking(Boolean(event.detail?.waking))
    }
    window.addEventListener(BACKEND_WAKE_EVENT, onWake)
    return () => window.removeEventListener(BACKEND_WAKE_EVENT, onWake)
  }, [])

  if (!waking) return null

  return (
    <div
      className="alert alert-info shadow d-flex align-items-center gap-3 position-fixed start-50 translate-middle-x mb-0"
      style={{ bottom: '1rem', zIndex: 2000, maxWidth: 'calc(100vw - 2rem)' }}
      role="status"
      aria-live="polite"
    >
      <div className="spinner-border spinner-border-sm flex-shrink-0" aria-hidden="true" />
      <div>
        <strong className="d-block">{t('common.serverWaking')}</strong>
        <small>{t('common.serverWakingHint')}</small>
      </div>
    </div>
  )
}

export default BackendWakeBanner
