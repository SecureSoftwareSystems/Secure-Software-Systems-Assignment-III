import { useState, type SubmitEvent} from "react";
import {login, ApiError} from "../api";

interface Props{
    onLogin : (token : string) => void;
}

import './Login.css'
function Login({onLogin} : Props){
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e : SubmitEvent<HTMLFormElement>){
        e.preventDefault();
        setError(null);
        setLoading(true);

        try{
            const {token} = await login(username, password);
            onLogin(token);
        }catch(err){
            setError(
                err instanceof ApiError
                ? "Invalid username or password."
                : "Could not reach the server. Is the backend running?"
            );
        }
    }
    return (
        <>
            <div className="login-panel">
                <div className="login-panel-inner">
                    <div className="login-heading">
                        <h2>Sign in</h2>
                        <p>Use your delegate, admin or auditor account.</p>
                    </div>
                    <form onSubmit={handleSubmit} className="login-form">
                        <label>Username
                            <input
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            />
                        </label>
                        <label>Password
                            <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            />
                        </label>
                        {
                            error && (
                                <p className="error" role="alert">
                                    {error}
                                </p>
                            )
                        }
                        <button 
                        type="submit"
                        disabled={loading}>
                        {loading ? "Sigining You In" : "Sign In"}
                        </button>
                    </form>
                </div>
            </div>
        </>
    );
}

export default Login;