import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import { useAuth } from './lib/auth.jsx';

import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import SpaceDetail from './pages/SpaceDetail.jsx';
import SmartMatch from './pages/SmartMatch.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Profile from './pages/Profile.jsx';
import MemberDashboard from './pages/MemberDashboard.jsx';
import OwnerDashboard from './pages/OwnerDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import MyBookings from './pages/MyBookings.jsx';
import MyInquiries from './pages/MyInquiries.jsx';
import OwnerSpaces from './pages/OwnerSpaces.jsx';
import SpaceForm from './pages/SpaceForm.jsx';
import NotFound from './pages/NotFound.jsx';

/** Gate a route on authentication and, optionally, on role. */
function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role) && user.role !== 'admin') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-xl font-semibold text-ink">Not available for your role</h1>
        <p className="mt-2 text-sm text-ink-soft">
          This area is for {roles.join(' or ')} accounts. You are signed in as{' '}
          <strong>{user.role === 'user' ? 'member' : user.role}</strong>.
        </p>
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/spaces" element={<Search />} />
        <Route path="/spaces/:id" element={<SpaceDetail />} />
        <Route path="/match" element={<SmartMatch />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="/dashboard" element={<Protected><MemberDashboard /></Protected>} />
        <Route path="/bookings" element={<Protected><MyBookings /></Protected>} />
        <Route path="/inquiries" element={<Protected><MyInquiries /></Protected>} />

        <Route path="/owner" element={
          <Protected roles={['owner']}><OwnerDashboard /></Protected>} />
        <Route path="/owner/spaces" element={
          <Protected roles={['owner']}><OwnerSpaces /></Protected>} />
        <Route path="/owner/spaces/new" element={
          <Protected roles={['owner']}><SpaceForm /></Protected>} />
        <Route path="/owner/spaces/:id/edit" element={
          <Protected roles={['owner']}><SpaceForm /></Protected>} />

        <Route path="/admin" element={
          <Protected roles={['admin']}><AdminDashboard /></Protected>} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
