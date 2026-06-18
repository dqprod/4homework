"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { UserPlus, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "student",
    username: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // 1. Supabase Auth Sign Up
      const { data, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      if (authError) throw authError;
      if (!data.user) throw new Error("User creation failed");

      // 2. Create Profile in public.profiles via FastAPI
      // We call our backend to ensure the profile is created with the correct role
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "/api"}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
          username: formData.username,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Profile creation failed");
      }

      alert("Registration successful! Please check your email for verification if required.");
      router.push("/login");
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 p-3 rounded-full">
              <UserPlus className="w-8 h-8 text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 text-sm">Join 4homework to start learning</p>
        </div>

        <form onSubmit={handleSignup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 ml-1">Full Name</label>
              <input 
                required 
                value={formData.full_name} 
                onChange={e => setFormData({...formData, full_name: e.target.value})}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all"
                placeholder="Name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700 ml-1">Username</label>
              <input 
                value={formData.username} 
                onChange={e => setFormData({...formData, username: e.target.value})}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all"
                placeholder="Unique ID"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 ml-1">Email</label>
            <input 
              type="email" 
              required 
              value={formData.email} 
              onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all"
              placeholder="email@example.com"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 ml-1">Password</label>
            <input 
              type="password" 
              required 
              value={formData.password} 
              onChange={e => setFormData({...formData, password: e.target.value})}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all"
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-700 ml-1">Your Role</label>
            <select 
              value={formData.role} 
              onChange={e => setFormData({...formData, role: e.target.value})}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition-all bg-white"
            >
              <option value="student">Student (学習者)</option>
              <option value="parent">Parent (保護者)</option>
            </select>
          </div>
          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-green-600 text-white py-2.5 rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Register Account"}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-gray-500">
            Already have an account?{" "}
            <a href="/login" className="text-green-600 font-medium hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    </div>
  );
}
