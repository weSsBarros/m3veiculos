import Hero from '../components/Hero.jsx'
import CarCarousel from '../components/CarCarousel.jsx'
import PromoBanner from '../components/PromoBanner.jsx'
import CategoryGrid from '../components/CategoryGrid.jsx'
import BrandGrid from '../components/BrandGrid.jsx'
import FAQ from '../components/FAQ.jsx'
import SetupNotice from '../components/SetupNotice.jsx'
import { useCars } from '../context/CarsContext.jsx'
import { Award } from 'lucide-react'
import './Home.css'

export default function Home() {
  const { cars, loading, error } = useCars()

  if (error === 'not-configured') return <SetupNotice />

  const destaques = cars.filter((c) => c.originalPrice).slice(0, 8)
  const novidades = [...cars].slice(0, 8)

  return (
    <>
      <Hero />

      {!loading && cars.length === 0 && (
        <div className="container home-empty">
          <p>Nenhum carro disponível no estoque no momento.</p>
        </div>
      )}

      {destaques.length > 0 && (
        <CarCarousel
          eyebrow="Ofertas da semana"
          title="Carros em destaque"
          cars={destaques}
          viewAllLink="/estoque"
        />
      )}

      <PromoBanner />

      {novidades.length > 0 && (
        <CarCarousel
          eyebrow="Chegaram agora"
          title="Novidades no estoque"
          cars={novidades}
          viewAllLink="/estoque"
        />
      )}

      <CategoryGrid />
      <BrandGrid />
      <FAQ />

      <section className="trust-strip">
        <div className="container trust-strip-inner">
          <Award size={22} />
          <p>Veículos revisados, com garantia e procedência verificada</p>
        </div>
      </section>
    </>
  )
}
