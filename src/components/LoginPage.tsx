import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff, Building2, FileSearch, Wand2, GitBranch, ArrowRight } from 'lucide-react';
import Threads from './common/Threads';
import GradientText from './common/GradientText';
import ForgotCredentialsModal from './auth/ForgotCredentialsModal';
import type { CompanyBranding } from '../types';

interface LoginPageProps {
  companyBranding?: CompanyBranding;
  onLogin: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  sessionExpiredMessage?: string | null;
  onClearSessionExpiredMessage?: () => void;
}

const THREADS_COLOR: [number, number, number] = [0.96, 0.62, 0.04];

export default function LoginPage({ companyBranding, onLogin, sessionExpiredMessage, onClearSessionExpiredMessage }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);

  const companyName = companyBranding?.showCompanyName && companyBranding?.companyName
    ? companyBranding.companyName
    : '';

  React.useEffect(() => {
    if (sessionExpiredMessage) {
      setError(sessionExpiredMessage);
      onClearSessionExpiredMessage?.();
    }
  }, [sessionExpiredMessage, onClearSessionExpiredMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      setError('Please enter both username/email and password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await onLogin(username.trim(), password);

      if (!result.success) {
        setError(result.message || 'Login failed');
      }
    } catch (error) {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(e as any);
    }
  };

  const features = [
    {
      icon: FileSearch,
      title: 'Extract',
      description: 'Extract data from documents using AI to quickly create Freight Bills and send to document imaging.'
    },
    {
      icon: Wand2,
      title: 'Transform',
      description: 'Transform documents using AI to rename and send to document imaging.'
    },
    {
      icon: GitBranch,
      title: 'Workflows',
      description: 'Use workflows to look up data via APIs, transform file names and email or SFTP.'
    }
  ];

  return (
    <div className="min-h-screen flex">
      <div
        className="hidden lg:flex lg:w-[55%] xl:w-[60%] relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 50%, #1e293b 100%)'
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.3) 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }}
        />

        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[300px] z-[1]">
          <Threads
            color={THREADS_COLOR}
            amplitude={2}
            distance={0.1}
            enableMouseInteraction={true}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 w-full">
          <div>
            {companyBranding?.logoUrl ? (
              <img
                src={companyBranding.logoUrl}
                alt="Company Logo"
                style={{ height: `${companyBranding.loginLogoSize || 80}px` }}
                className="w-auto object-contain mb-8"
              />
            ) : (
              <div className="w-16 h-16 xl:w-20 xl:h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center mb-8 shadow-lg">
                <Building2 className="h-8 w-8 xl:h-10 xl:w-10 text-white" />
              </div>
            )}

            {companyName && (
              <h1 className="text-4xl xl:text-5xl font-bold text-white mb-2 leading-tight">
                {companyName}
              </h1>
            )}
            <GradientText
              colors={["#ff0000", "#ff8800", "#ffaa00", "#ff8800", "#ff0000"]}
              animationSpeed={3}
              showBorder={false}
              className="text-2xl xl:text-3xl font-semibold mb-1"
            >
              Welcome to Parse-It
            </GradientText>
            <p className="text-slate-400 text-base">PDF Data Extraction</p>
          </div>

          <div className="space-y-6 mt-auto">
            {features.map((feature, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0 border border-slate-600/50">
                  <feature.icon className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">{feature.title}</h3>
                  <p className="text-slate-400 text-sm">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8">
          <div className="w-full max-w-md">
            <div className="lg:hidden mb-8 text-center">
              {companyBranding?.logoUrl ? (
                <img
                  src={companyBranding.logoUrl}
                  alt="Company Logo"
                  style={{ height: `${Math.min((companyBranding?.loginLogoSize || 80) * 0.6, 48)}px` }}
                  className="w-auto object-contain mx-auto mb-4"
                />
              ) : (
                <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
              )}
              {companyName && <h2 className="text-xl font-bold text-slate-900">{companyName}</h2>}
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-10">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome back</h2>
                <p className="text-slate-500">Sign in to your account to continue</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Username or Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="w-full pl-11 pr-4 py-3 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all duration-200 placeholder:text-slate-400"
                      placeholder="Enter your username or email"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-slate-400" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="w-full pl-11 pr-12 py-3 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all duration-200 placeholder:text-slate-400"
                      placeholder="Enter your password"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center"
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-slate-400 hover:text-slate-600 transition-colors" />
                      ) : (
                        <Eye className="h-5 w-5 text-slate-400 hover:text-slate-600 transition-colors" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 focus:ring-offset-0"
                      disabled={isLoading}
                    />
                    <span className="text-sm text-slate-600">Remember me</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(true)}
                    className="text-sm text-orange-500 hover:text-orange-600 font-medium transition-colors"
                  >
                    Forgot Username or Password?
                  </button>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 disabled:cursor-not-allowed shadow-lg shadow-slate-900/10 hover:-translate-y-1 hover:shadow-2xl"
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        <ForgotCredentialsModal
          isOpen={showForgotModal}
          onClose={() => setShowForgotModal(false)}
          userType="admin"
        />

        {companyName && (
          <div className="py-6 text-center">
            <p className="text-sm text-slate-400">
              &copy; {new Date().getFullYear()} {companyName}. All rights reserved.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
