import React from 'react'

export default class HataSiniri extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hata: null }
  }
  static getDerivedStateFromError(hata) {
    return { hata }
  }
  componentDidCatch(hata, bilgi) {
    console.error('HataSiniri:', hata, bilgi)
  }
  render() {
    if (this.state.hata) {
      return (
        <div style={{ padding: 24, color: '#fff', background: '#0b2a4a', minHeight: '100vh' }}>
          <h2 style={{ color: '#f87171' }}>Sayfa yüklenirken hata oluştu</h2>
          <pre style={{ background: '#1e293b', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap' }}>
            {String(this.state.hata?.message || this.state.hata)}
            {'\n\n'}
            {this.state.hata?.stack || ''}
          </pre>
          <button
            onClick={() => { this.setState({ hata: null }); window.location.reload() }}
            style={{ marginTop: 12, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
          >
            Yeniden yükle
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
