import { useState } from "react";
import Login from "./Login"
import ExclusionsDashboard from "./ExclusionDashboard";
import IntegrityConsole from "./IntegrityConsole";
import "./IntegrityConsole.css";
import { decodeJwtPayload } from "../jwt";

type Tab = "exclusions" | "integrity";

function Dashboard(){
    const [token, setToken] = useState<string | null>(null);
    const [tab, setTab] = useState<Tab>("exclusions");
    const decoded = token ? decodeJwtPayload(token) : null;
    if (!token || !decoded)
        return <Login onLogin={setToken} />

    return (
        <>
        <nav className="console-tabs" role="tablist" aria-label="Console sections">
            <button role="tab" aria-selected={tab === "exclusions"} onClick={() => setTab("exclusions")}>Exclusions</button>
            <button role="tab" aria-selected={tab === "integrity"} onClick={() => setTab("integrity")}>Count &amp; Audit</button>
        </nav>
        {tab === "exclusions" ? (
        <ExclusionsDashboard
        token={token}
        role={decoded.role}
        userId={decoded.sub}
        onLogout={() => setToken(null)}
        />
        ) : (
        <IntegrityConsole
        token={token}
        role={decoded.role}
        onLogout={() => setToken(null)}
        />
        )}
        </>
    );
}

export default Dashboard;
