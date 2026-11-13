import { AnalyticsScripts } from './components/AnalyticsScripts';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { StoreProvider, useStore } from './context/StoreContext';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';
import { CatalogPage } from './pages/CatalogPage';
import { EcosystemPage } from './pages/EcosystemPage';
import { HomePage } from './pages/HomePage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { AboutPage, ContactPage, NotFoundPage, PolicyPage } from './pages/StaticPages';

function StoreRouter() {
  const { currentPath } = useStore();
  const path = currentPath.split('?')[0].replace(/\/+$/, '') || '/';

  if (path === '/') return <HomePage />;
  if (path === '/shop') return <CatalogPage mode="shop" />;
  if (path === '/categories') return <CatalogPage mode="categories" />;
  if (path.startsWith('/categories/')) {
    const slug = path.replace('/categories/', '');
    return <CatalogPage mode="category-detail" categorySlug={slug} />;
  }
  if (path === '/bundles') return <CatalogPage mode="bundles" />;
  if (path === '/free-resources') return <CatalogPage mode="free-resources" />;
  if (path === '/new-arrivals') return <CatalogPage mode="new-arrivals" />;
  if (path === '/bestsellers') return <CatalogPage mode="bestsellers" />;
  if (path === '/ecosystem') return <EcosystemPage />;
  if (path.startsWith('/products/')) {
    const slug = path.replace('/products/', '');
    return <ProductDetailPage slug={slug} />;
  }
  if (path === '/about') return <AboutPage />;
  if (path === '/contact') return <ContactPage />;
  if (path === '/terms') return <PolicyPage type="terms" />;
  if (path === '/privacy') return <PolicyPage type="privacy" />;
  if (path === '/refund-policy') return <PolicyPage type="refund" />;
  if (path === '/licence-policy') return <PolicyPage type="licence" />;
  if (path === '/account') return <AccountPage />;
  if (path === '/admin') return <AdminPage />;

  return <NotFoundPage />;
}

export default function App() {
  return (
    <StoreProvider>
      <AnalyticsScripts />
      <div className="min-h-screen flex flex-col bg-[#FAF8F4] text-[#171A21]">
        <Navbar />
        <main className="flex-1">
          <StoreRouter />
        </main>
        <Footer />
        <CartDrawer />
      </div>
    </StoreProvider>
  );
}
