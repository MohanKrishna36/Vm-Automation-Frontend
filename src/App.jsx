import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VM from "./pages/VM";
import MultiVM from "./pages/MultiVM";
import Reports from "./pages/Reports";
import Dispatcher from "./pages/Dispatcher";
import { VMProvider } from "./contexts/VMContext";

export default function App() {
  return (
    <VMProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/vm/multi" element={<MultiVM />} />
          <Route path="/vm/:vmId" element={<VM />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/dispatcher/:vmId" element={<Dispatcher />} />
          <Route path="/dispatcher" element={<Dispatcher />} />
        </Routes>
      </BrowserRouter>
    </VMProvider>
  );
}
