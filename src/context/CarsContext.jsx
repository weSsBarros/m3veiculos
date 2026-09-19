import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchAvailableCars } from '../lib/carsApi.js'
import { isSupabaseConfigured } from '../lib/supabaseClient.js'

const CarsContext = createContext(null)

export function CarsProvider({ children }) {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      setError('not-configured')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAvailableCars()
      setCars(data)
    } catch (err) {
      setError(err.message || 'Erro ao carregar os carros.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <CarsContext.Provider value={{ cars, loading, error, reload }}>
      {children}
    </CarsContext.Provider>
  )
}

export function useCars() {
  const ctx = useContext(CarsContext)
  if (!ctx) throw new Error('useCars precisa estar dentro de <CarsProvider>')
  return ctx
}
