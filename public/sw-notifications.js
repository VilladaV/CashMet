self.addEventListener('push', (event) => {
  if (!(self.Notification && self.Notification.permission === 'granted')) return
  const data = event.data ? event.data.json() : { title: 'CashMet', body: 'Nuevo recordatorio' }
  event.waitUntil(self.registration.showNotification(data.title || 'CashMet', { body: data.body || '', icon: '/icons.svg' }))
})
