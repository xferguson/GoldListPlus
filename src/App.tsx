import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './routes/Layout';
import { Dashboard } from './routes/Dashboard';
import { Book } from './routes/Book';
import { ListDetail } from './routes/ListDetail';
import { Review } from './routes/Review';
import { ReviewSummary } from './routes/Distill/ReviewSummary';
import { Builder } from './routes/Distill/Builder';
import { GoldSummary } from './routes/Distill/GoldSummary';
import { Stats } from './routes/Stats';
import { Settings } from './routes/Settings';
import { NotFound } from './routes/NotFound';

export function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/book/:bookId" element={<Book />} />
        <Route path="/list/:pageId" element={<ListDetail />} />
        <Route path="/review/:pageId" element={<Review />} />
        <Route path="/distill/review/:pageId" element={<ReviewSummary />} />
        <Route path="/distill/builder/:parentId" element={<Builder />} />
        <Route path="/distill/gold/:pageId" element={<GoldSummary />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
