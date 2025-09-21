import React, { useEffect, useState } from "react";
import "../styles/cards.css";


const API_BASE = "https://backend-gfho.onrender.com"; // change if backend URL differs


const AffiliateDashboard = () => {
  const [user, setUser] = useState(null); // { role, id, name, email }
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);


  const [allAffiliates, setAllAffiliates] = useState([]);
  const [affiliateData, setAffiliateData] = useState(null);


  const [loginForm, setLoginForm] = useState({
    role: "admin",
    identifier: "",
    password: "",
    email: "",
  });


  const [affiliateForm, setAffiliateForm] = useState({
    id: null,
    name: "",
    email: "",
    commissionRate: 0.2,
  });
  const [editMode, setEditMode] = useState(false);


  // ------------------------
  // Login Handler
  // ------------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);


    try {
      let url = "";
      let body = {};


      if (loginForm.role === "admin") {
        url = `${API_BASE}/api/affiliates/admin-login`;
        body = { username: loginForm.identifier, password: loginForm.password };
      } else if (loginForm.role === "affiliate") {
        url = `${API_BASE}/api/affiliates/affiliate-login`;
        body = { email: loginForm.email };
      }


      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });


      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Login failed");


      setUser(data.user);
      setToken(data.token);
      fetchDashboard(data.user, data.token);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  // ------------------------
  // Fetch dashboard data
  // ------------------------
  const fetchDashboard = async (loggedUser = user, authToken = token) => {
    if (!loggedUser || !authToken) return;


    try {
      const res = await fetch(`${API_BASE}/api/affiliates`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });


      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to fetch data");


      if (loggedUser.role === "admin") setAllAffiliates(data.data || []);
      if (loggedUser.role === "affiliate") setAffiliateData(data.data || {});
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };


  // ------------------------
  // Logout
  // ------------------------
  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setAllAffiliates([]);
    setAffiliateData(null);
    setLoginForm({ role: "admin", identifier: "", password: "", email: "" });
    setError(null);
  };


  // ------------------------
  // Admin: Create / Update Affiliate
  // ------------------------
  const handleSubmitAffiliate = async (e) => {
    e.preventDefault();
    if (!user || user.role !== "admin") return;
    setError(null);


    const url = editMode
      ? `${API_BASE}/api/affiliates/${affiliateForm.id}`
      : `${API_BASE}/api/affiliates/create`;
    const method = editMode ? "PUT" : "POST";


    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: affiliateForm.name,
          email: affiliateForm.email,
          commissionRate: affiliateForm.commissionRate,
        }),
      });


      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Operation failed");


      setAffiliateForm({ id: null, name: "", email: "", commissionRate: 0.2 });
      setEditMode(false);
      fetchDashboard();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };


  const handleEdit = (aff) => {
    setAffiliateForm({
      id: aff.id,
      name: aff.name,
      email: aff.email,
      commissionRate: aff.commission_rate,
    });
    setEditMode(true);
  };


  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure? This will soft delete.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/affiliates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });


      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Delete failed");
      fetchDashboard();
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };


  // ------------------------
  // UI
  // ------------------------
  if (!user)
    return (
      <div className="affiliate-dashboard login-page">
        <h2>Login</h2>
        {error && <p className="error-message">{error}</p>}
        <form onSubmit={handleLogin}>
          <select
            value={loginForm.role}
            onChange={(e) =>
              setLoginForm({
                ...loginForm,
                role: e.target.value,
                identifier: "",
                password: "",
                email: "",
              })
            }
          >
            <option value="admin">Admin</option>
            <option value="affiliate">Affiliate</option>
          </select>


          {loginForm.role === "admin" && (
            <>
              <input
                placeholder="Admin Username"
                value={loginForm.identifier}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, identifier: e.target.value })
                }
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) =>
                  setLoginForm({ ...loginForm, password: e.target.value })
                }
                required
              />
            </>
          )}


          {loginForm.role === "affiliate" && (
            <input
              type="email"
              placeholder="Affiliate Email"
              value={loginForm.email}
              onChange={(e) =>
                setLoginForm({ ...loginForm, email: e.target.value })
              }
              required
            />
          )}


          <button type="submit">{loading ? "Logging in..." : "Login"}</button>
        </form>
      </div>
    );


  // ------------------------
  // Admin Dashboard
  // ------------------------
  if (user.role === "admin")
    return (
      <div className="affiliate-dashboard">
        <div className="top-bar">
          <h2>Admin Dashboard</h2>
          <button onClick={handleLogout}>Logout</button>
        </div>


        {error && <p className="error-message">{error}</p>}


        <h3>All Affiliates</h3>
        <table className="affiliate-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Commission</th>
              <th>Sales</th>
              <th>Revenue</th>
              <th>Commission Earned</th>
              <th>Referral Link</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allAffiliates.map((aff) => (
              <tr key={aff.id}>
                <td>{aff.name}</td>
                <td>{aff.email}</td>
                <td>{aff.commission_rate}</td>
                <td>{aff.sales_count}</td>
                <td>₹{aff.total_revenue}</td>
                <td>₹{aff.total_commission}</td>
                <td>
                  <a
                    href={aff.referral_link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {aff.referral_link}
                  </a>
                </td>
                <td>
                  <button onClick={() => handleEdit(aff)}>✏️</button>
                  <button onClick={() => handleDelete(aff.id)}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>


        <h3>{editMode ? "Edit Affiliate" : "Create New Affiliate"}</h3>
        <form onSubmit={handleSubmitAffiliate}>
          <input
            placeholder="Name"
            value={affiliateForm.name}
            onChange={(e) =>
              setAffiliateForm({ ...affiliateForm, name: e.target.value })
            }
            required
          />
          <input
            placeholder="Email"
            type="email"
            value={affiliateForm.email}
            onChange={(e) =>
              setAffiliateForm({ ...affiliateForm, email: e.target.value })
            }
            required
          />
          <input
            placeholder="Commission Rate (0-1)"
            type="number"
            step="0.01"
            value={affiliateForm.commissionRate}
            onChange={(e) =>
              setAffiliateForm({
                ...affiliateForm,
                commissionRate: parseFloat(e.target.value),
              })
            }
          />
          <button type="submit">{editMode ? "Update" : "Create"}</button>
        </form>
      </div>
    );


  // ------------------------
  // Affiliate Dashboard
  // ------------------------
  if (user.role === "affiliate")
    return (
      <div className="affiliate-dashboard">
        <div className="top-bar">
          <h2>Affiliate Dashboard</h2>
          <button onClick={handleLogout}>Logout</button>
        </div>


        {error && <p className="error-message">{error}</p>}


        {affiliateData && (
          <>
            <h3>Your Info</h3>
            <p>
              <strong>Name:</strong> {affiliateData.name}
            </p>
            <p>
              <strong>Email:</strong> {affiliateData.email}
            </p>
            <p>
              <strong>Commission Rate:</strong>{" "}
              {affiliateData.commission_rate}
            </p>
            <p>
              <strong>Total Sales:</strong> {affiliateData.sales_count}
            </p>
            <p>
              <strong>Total Revenue:</strong> ₹{affiliateData.total_revenue}
            </p>
            <p>
              <strong>Commission Earned:</strong> ₹
              {affiliateData.total_commission}
            </p>
            <p>
              <strong>Your Referral Link:</strong>{" "}
              <a
                href={affiliateData.referral_link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {affiliateData.referral_link}
              </a>
            </p>
          </>
        )}
      </div>
    );
};


export default AffiliateDashboard;