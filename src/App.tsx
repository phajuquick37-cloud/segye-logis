import { BrowserRouter, Routes, Route } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Order from "./pages/Order";
import Notice from "./pages/Notice";
import Contract from "./pages/Contract";
import Admin from "./pages/Admin";
import ApiPage from "./pages/ApiPage";
import Vehicles from "./pages/Vehicles";
import Faq from "./pages/Faq";
import CargoCalculator from "./pages/CargoCalculator";
import ScrollToTop from "./components/ScrollToTop";
import FloatingButtons from "./components/FloatingButtons";

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="min-h-screen bg-white font-sans antialiased flex flex-col">
        <Header />
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/order" element={<Order />} />
            <Route path="/notice" element={<Notice />} />
            <Route path="/contract" element={<Contract />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/api-integration" element={<ApiPage />} />
            <Route path="/vehicles" element={<Vehicles />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/cargo" element={<CargoCalculator />} />
          </Routes>
        </main>
        <Footer />
        <FloatingButtons />
      </div>
    </BrowserRouter>
  );
}
