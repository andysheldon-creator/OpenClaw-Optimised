// Simple test version of App to debug
import './styles/global.css'

function SimpleApp() {
  return (
    <div style={{ 
      padding: '20px', 
      color: 'var(--text-primary)',
      background: 'var(--bg-primary)',
      minHeight: '100vh'
    }}>
      <h1>🦞 OpenClaw Dashboard</h1>
      <p>If you see this, the basic React setup is working!</p>
    </div>
  )
}

export default SimpleApp
