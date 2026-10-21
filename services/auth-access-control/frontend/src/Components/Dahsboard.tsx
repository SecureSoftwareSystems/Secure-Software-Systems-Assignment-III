import { useState } from "react";
import Login from "./Login"
import ExclusionsDashboard from "./ExclusionDashboard";
import { decodeJwtPayload } from "../jwt";

function Dashboard(){
    const [token, setToken] = useState<string | null>(null);
    const decoded = token ? decodeJwtPayload(token) : null;
    if (!token || !decoded)
        return <Login onLogin={setToken} />

    return (
        <ExclusionsDashboard
        token={token}
        role={decoded.role}
        userId={decoded.sub}
        onLogout={() => setToken(null)}
        />
    );
}

export default Dashboard;