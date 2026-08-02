import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Loader2, Play, User, Eye, EyeOff, Sparkles, Check, Crown, X, ShieldCheck, Zap, Tag } from 'lucide-react';
import { supabase, getPlansFromSupabase, type DBPlan } from '../lib/supabase';

interface LoginPanelProps {
  onLoginSuccess: () => void;
}

const BACKDROP_POSTERS = [
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8yDd2WJE3P1WInfcnGRdXiYK2pI.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/jnq1i2obAreHlkfEZCswlKu1zvF.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/rfawOwTzIEDoBIVgNxpXtrvngus.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/hw1GzjpTcxhhgaI5Rd4s6EP3gbX.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/7TXWDEHQmYO4K3Ots0O4k6H5kSv.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/eCDYhFdgnon6jmtLaBgsSsVg0FN.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/1ZLjPe9jTyTvd5xophLDVchXfpe.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/sYvLOHT7Om7RbJcaSfFIlsNGAJ3.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/oxn4ylDZSnQq83H0jXAmueBFV8A.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/8Gxv8gS511g25tZ5RDasmvm47zw.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/d5N04wPfg51VEM1GCYDr6UpRHWn.jpg",
  "https://image.tmdb.org/t/p/w600_and_h900_bestv2/owo8a7j0I9qGsk7N9fA361e6joo.jpg",
];

const DEFAULT_PLANS: DBPlan[] = [
  {
    id: 'basic',
    name: 'Plano Econômico',
    price: 'R$ 14,90',
    period: '/mês',
    description: 'Acesso individual com excelente resolução.',
    is_popular: false,
    features: [
      '1 Tela Simultânea',
      'Qualidade SD/HD (720p)',
      '1 Perfil Personalizado',
      'Catálogo Completo'
    ]
  },
  {
    id: 'standard',
    name: 'Plano Padrão HD',
    price: 'R$ 24,90',
    period: '/mês',
    description: 'Mais popular para casais e famílias.',
    is_popular: true,
    features: [
      '2 Telas Simultâneas',
      'Full HD 1080p',
      'Até 3 Perfis na Conta',
      'Sem Anúncios'
    ]
  },
  {
    id: 'premium',
    name: 'Plano Premium 4K',
    price: 'R$ 34,90',
    period: '/mês',
    description: 'Qualidade máxima de cinema.',
    is_popular: false,
    features: [
      '4 Telas 4K UHD',
      'Áudio Espacial Dolby',
      'Até 3 Perfis na Conta',
      'Download Offline'
    ]
  }
];

export const LoginPanel: React.FC<LoginPanelProps> = ({ onLoginSuccess }) => {
  // Input states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // UI States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPlansModal, setShowPlansModal] = useState(false);

  // Live Plans state loaded from Supabase DB
  const [plans, setPlans] = useState<DBPlan[]>(DEFAULT_PLANS);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);

  // Load plans from Supabase DB on component load
  useEffect(() => {
    let isMounted = true;
    const loadPlans = async () => {
      setIsLoadingPlans(true);
      try {
        const dbPlans = await getPlansFromSupabase();
        if (isMounted && dbPlans && dbPlans.length > 0) {
          setPlans(dbPlans);
        }
      } catch (err) {
        console.warn('Using default plans:', err);
      } finally {
        if (isMounted) setIsLoadingPlans(false);
      }
    };
    loadPlans();
    return () => { isMounted = false; };
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const cleanUsername = username.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername || !cleanPassword) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    try {
      let matchedUser: { username: string; name?: string } | null = null;

      const checkUserStatus = (userObj: any) => {
        if (!userObj) return;

        const status = (userObj.status || userObj.account_status || userObj.situacao || userObj.estado || '').toString().toLowerCase();
        const isBlocked = userObj.blocked === true || userObj.bloqueado === true || userObj.is_blocked === true || userObj.banned === true;
        const isSuspended = userObj.suspended === true || userObj.suspenso === true || userObj.is_suspended === true;
        const isActive = userObj.is_active !== undefined 
          ? userObj.is_active 
          : (userObj.active !== undefined ? userObj.active : (userObj.ativo !== undefined ? userObj.ativo : true));

        // Detectar bloqueios (por status, booleano de bloqueio ou conta desativada)
        if (
          status === 'blocked' || 
          status === 'bloqueado' || 
          status === 'banned' || 
          status === 'banido' || 
          isBlocked || 
          isActive === false ||
          isActive === 0 ||
          isActive === 'false'
        ) {
          throw new Error('Sua conta foi bloqueada. Entre em contato com o suporte para reativar seu acesso.');
        }

        // Detectar suspensão temporária
        if (status === 'suspended' || status === 'suspenso' || isSuspended) {
          throw new Error('Sua conta está suspensa temporariamente. Entre em contato com o suporte.');
        }

        // Detectar inatividade
        if (status === 'inactive' || status === 'inativo' || status === 'desativado') {
          throw new Error('Sua conta está inativa. Entre em contato com o suporte para ativar.');
        }
      };

      // 1. Tentar buscar em public.users (case-insensitive por username ou email)
      const { data: dbUser } = await supabase
        .from('users')
        .select('*')
        .or(`username.ilike.${cleanUsername},email.ilike.${cleanUsername}`)
        .maybeSingle();

      if (dbUser) {
        if (dbUser.password === cleanPassword || dbUser.password === password) {
          // Verificar se a conta foi bloqueada/suspensa pelo Painel ADM
          checkUserStatus(dbUser);

          matchedUser = {
            username: dbUser.username,
            name: dbUser.name || dbUser.username,
          };
        }
      } else {
        // Busca alternativa sem filtro de email para verificação flexível
        const { data: flexUser } = await supabase
          .from('users')
          .select('*')
          .ilike('username', cleanUsername)
          .maybeSingle();

        if (flexUser && (flexUser.password === cleanPassword || flexUser.password === password)) {
          checkUserStatus(flexUser);

          matchedUser = {
            username: flexUser.username,
            name: flexUser.name || flexUser.username,
          };
        }
      }

      // 2. Se não encontrar em public.users, tentar Supabase Auth (auth.users)
      if (!matchedUser) {
        const emailToTry = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@baixocusto.com`;
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email: emailToTry,
          password: cleanPassword,
        });

        if (authErr) {
          const errText = (authErr.message || '').toLowerCase();
          if (errText.includes('banned') || errText.includes('blocked') || errText.includes('disabled')) {
            throw new Error('Sua conta foi bloqueada. Entre em contato com o suporte para reativar seu acesso.');
          }
        }

        if (!authErr && authData?.user) {
          const userMeta = authData.user.user_metadata || {};
          checkUserStatus(userMeta);
          checkUserStatus(authData.user);

          matchedUser = {
            username: userMeta.username || authData.user.email?.split('@')[0] || cleanUsername,
            name: userMeta.name || userMeta.username || cleanUsername,
          };
        }
      }

      if (!matchedUser) {
        throw new Error('Usuário ou senha incorretos.');
      }

      // Salvar sessão e autorizar login
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('loggedUsername', matchedUser.username.toLowerCase());
      localStorage.setItem('loggedUserName', matchedUser.name || matchedUser.username);
      onLoginSuccess();
    } catch (err: any) {
      setError(err.message || 'Usuário ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = (plan: DBPlan) => {
    setShowPlansModal(false);

    const planName = plan.name || plan.nome || 'Plano BaixoCustoFlix';
    const planPrice = plan.price || plan.preco || '';
    const planPeriod = plan.period || plan.periodo || '';
    const discountLabel = plan.discount || plan.desconto || (
      plan.id === 'anual' ? '-50% OFF' : (plan.id === 'trimestral' ? '-35% OFF' : '-25% OFF')
    );

    const rawFeatures = plan.features || plan.beneficios || plan.benefits || [];
    let featuresList: string[] = [];
    if (Array.isArray(rawFeatures)) {
      featuresList = rawFeatures.map(f => String(f));
    } else if (typeof rawFeatures === 'string') {
      featuresList = (rawFeatures as string).split(',').map(s => s.trim()).filter(Boolean);
    }

    const featuresFormatted = featuresList.length > 0 
      ? featuresList.map(f => `• ${f}`).join('\n') 
      : '• Acesso ilimitado a filmes e séries';

    const message = `🍿 *OLÁ! GOSTARIA DE ASSINAR O BAIXOCUSTOFLIX* 🍿\n\n📌 *Plano Escolhido:* ${planName}\n💰 *Valor:* ${planPrice} ${planPeriod}\n🏷️ *Desconto:* ${discountLabel}\n\n⚡ *Benefícios Inclusos:*\n${featuresFormatted}\n\nQuero ativar meu acesso imediato! 🚀`;

    const whatsappUrl = `https://api.whatsapp.com/send?phone=5581999374666&text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const renderPosterGrid = () => {
    return (
      <div className="absolute inset-0 overflow-hidden opacity-[0.38] pointer-events-none select-none z-0">
        <div className="absolute -inset-10 md:-inset-20 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 transform -rotate-[15deg] scale-135">
          {[...Array(8)].map((_, colIndex) => {
            const shuffledPosters = [
              ...BACKDROP_POSTERS.slice(colIndex),
              ...BACKDROP_POSTERS.slice(0, colIndex)
            ];
            return (
              <div 
                key={colIndex} 
                className={`flex flex-col gap-5 ${
                  colIndex % 2 === 0 ? 'translate-y-24' : '-translate-y-16'
                }`}
              >
                {shuffledPosters.map((poster, index) => (
                  <div 
                    key={index} 
                    className="aspect-[2/3] w-full rounded-xl overflow-hidden border border-white/5 bg-zinc-950 shadow-2xl sepia contrast-[1.25] brightness-[0.55]"
                  >
                    <img 
                      src={poster} 
                      alt="Poster" 
                      className="w-full h-full object-cover pointer-events-none select-none"
                      loading="lazy" 
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-black overflow-x-hidden select-none py-8 px-4">
      {/* Grid of cinematic posters */}
      {renderPosterGrid()}

      {/* Dark premium radial overlay */}
      <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,_rgba(25,18,5,0.18)_10%,_rgba(0,0,0,0.88)_85%)] pointer-events-none" />

      {/* Main Authentication Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-[390px] px-6 py-8 sm:px-8 sm:py-9 bg-[#0c0c0e]/95 border border-cinemaGold/30 rounded-[26px] shadow-[0_0_60px_rgba(0,0,0,0.95)] z-20 mx-auto backdrop-blur-xl relative"
      >
        {/* Brand Logo Header */}
        <div className="flex flex-col items-center justify-center mb-5">
          <div className="text-center font-outfit select-none pointer-events-none flex flex-col items-center">
            <div className="text-[26px] font-extrabold text-white leading-none tracking-tight">
              Baixo
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-0.5">
              <span className="text-[26px] font-extrabold text-white leading-none tracking-tight">Custo</span>
              <span className="text-[26px] font-extrabold text-cinemaGold leading-none tracking-tight">Flix</span>
              <div className="w-6 h-6 rounded-lg bg-cinemaGold flex items-center justify-center ml-1 shadow-[0_0_10px_rgba(245,179,36,0.4)]">
                <Play className="w-3.5 h-3.5 fill-obsidian stroke-none translate-x-[1px]" />
              </div>
            </div>
          </div>
          <div className="w-8 h-[2px] bg-cinemaGold rounded-full mt-2.5" />
          
          <p className="text-[11px] text-zinc-400 mt-2 font-outfit text-center">
            Entre com seus dados para continuar assistindo
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-center">
              {error}
            </div>
          )}

          {/* Username Input */}
          <div className="relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Usuário"
              autoComplete="username"
              className="w-full pl-10 pr-4 py-2.5 bg-[#0d0d0f] hover:bg-[#121215] focus:bg-[#070708] border border-zinc-800 focus:border-cinemaGold/50 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none transition-all duration-300 font-medium"
            />
          </div>

          {/* Password Input */}
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Senha"
              className="w-full pl-10 pr-10 py-2.5 bg-[#0d0d0f] hover:bg-[#121215] focus:bg-[#070708] border border-zinc-800 focus:border-cinemaGold/50 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none transition-all duration-300 font-medium"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Checkbox and Forgot Link */}
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 mt-0.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRememberMe(!rememberMe)}
                className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                  rememberMe 
                    ? 'bg-cinemaGold border-cinemaGold text-black' 
                    : 'bg-[#0d0d0f] border-zinc-700 text-transparent'
                }`}
              >
                {rememberMe && (
                  <svg className="w-2.5 h-2.5 stroke-[3.5] stroke-black" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
              </button>
              <span className="cursor-pointer select-none text-zinc-400 hover:text-zinc-300" onClick={() => setRememberMe(!rememberMe)}>
                Lembrar
              </span>
            </div>
            
            <a href="#" className="hover:underline hover:text-cinemaGold transition-colors">
              Esqueceu a senha?
            </a>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1.5 flex items-center justify-center gap-2 bg-cinemaGold hover:bg-amber-400 disabled:bg-cinemaGold/40 text-black font-outfit font-bold text-xs uppercase tracking-wider py-2.5 rounded-xl shadow-md hover:scale-[1.01] active:scale-95 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>Entrando...</span>
              </>
            ) : (
              <span>Entrar</span>
            )}
          </button>
        </form>

        {/* Section to Check Subscription Plans */}
        <div className="mt-4 pt-3.5 border-t border-zinc-800/80 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPlansModal(true)}
            className="w-full py-2 px-3.5 bg-zinc-900/90 hover:bg-zinc-800 border border-cinemaGold/40 hover:border-cinemaGold text-cinemaGold font-outfit font-bold text-[11px] uppercase tracking-wider rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm hover:scale-[1.01]"
          >
            <Crown className="w-3.5 h-3.5 text-cinemaGold" />
            <span>Ver Planos de Assinatura</span>
          </button>

          <p className="text-[10px] text-zinc-500 text-center leading-tight font-outfit">
            Caso não tenha conta, conheça os planos sem fidelidade.
          </p>
        </div>
      </motion.div>

      {/* Ultra-Fast Hardware Accelerated Subscription Plans Modal */}
      <AnimatePresence>
        {showPlansModal && (
          <div 
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowPlansModal(false);
            }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="relative w-full max-w-3xl bg-[#0f0f13] border border-cinemaGold/40 rounded-2xl p-4 sm:p-6 shadow-[0_0_50px_rgba(0,0,0,0.9)] my-auto overflow-hidden will-change-transform z-10"
            >
              {/* Close Modal Button */}
              <button
                type="button"
                onClick={() => setShowPlansModal(false)}
                className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer z-20"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="text-center flex flex-col items-center mb-4">
                <div className="flex items-center gap-1.5 text-cinemaGold font-outfit font-bold text-[10px] uppercase tracking-widest bg-cinemaGold/10 border border-cinemaGold/30 px-2.5 py-0.5 rounded-full mb-1.5">
                  {isLoadingPlans ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>{isLoadingPlans ? 'Carregando planos...' : 'Valores Atualizados do Banco de Dados'}</span>
                </div>
                
                <h2 className="font-outfit font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                  Planos de Assinatura BaixoCustoFlix
                </h2>
                <p className="text-[11px] text-zinc-400 mt-1 max-w-md font-outfit">
                  Lançamentos 2026, filmes e séries sem fidelidade ou anúncios.
                </p>
              </div>

              {/* Plans Carousel on Mobile (flex overflow-x-auto) / Grid on Desktop (sm:grid sm:grid-cols-3) */}
              <div className="flex sm:grid sm:grid-cols-3 gap-3 items-stretch overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-3 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {(plans || []).map((plan, index) => {
                  if (!plan) return null;
                  const planName = plan.name || plan.nome || `Plano ${index + 1}`;
                  const planPrice = plan.price || plan.preco || '';
                  const planOriginalPrice = plan.original_price || plan.preco_original || plan.old_price;
                  const planDiscount = plan.discount || plan.desconto;
                  const planPeriod = plan.period || plan.periodo || '';
                  const planDesc = plan.description || plan.descricao || '';
                  const isPopular = plan.is_popular ?? plan.popular ?? plan.destaque ?? (plan.id === 'trimestral');
                  
                  // Parsing seguro para evitar crash caso venha string do banco de dados
                  const rawFeatures = plan.features || plan.beneficios || plan.benefits || [];
                  let planFeatures: string[] = [];
                  if (Array.isArray(rawFeatures)) {
                    planFeatures = rawFeatures.map(f => String(f));
                  } else if (typeof rawFeatures === 'string' && (rawFeatures as string).trim()) {
                    try {
                      const parsed = JSON.parse(rawFeatures);
                      planFeatures = Array.isArray(parsed) ? parsed.map(v => String(v)) : [(rawFeatures as string)];
                    } catch {
                      planFeatures = (rawFeatures as string).split(',').map(s => s.trim()).filter(Boolean);
                    }
                  }

                  const discountLabel = planDiscount || (
                    plan.id === 'anual' ? '-50% OFF' : (plan.id === 'trimestral' ? '-35% OFF' : '-25% OFF')
                  );

                  return (
                    <div
                      key={plan.id || index}
                      className={`snap-center shrink-0 w-[84vw] max-w-[280px] sm:w-auto sm:shrink relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl border transition-all duration-200 ${
                        isPopular
                          ? 'bg-gradient-to-b from-[#1c1609] via-[#120f07] to-[#0c0c0e] border-cinemaGold shadow-[0_0_30px_rgba(245,179,36,0.2)]'
                          : 'bg-[#121216]/95 border-zinc-800/90 hover:border-zinc-700'
                      }`}
                    >
                      {/* Selo RECOMENDADO / Mais Popular */}
                      {isPopular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cinemaGold text-black font-outfit font-black text-[9px] uppercase tracking-widest px-3 py-0.5 rounded-full shadow-md flex items-center gap-1 z-10 border border-amber-300">
                          <Crown className="w-2.5 h-2.5 fill-black stroke-none" />
                          <span>RECOMENDADO</span>
                        </div>
                      )}

                      <div>
                        {/* Header: Nome + Subtítulo Período + ETIQUETA DE DESCONTO */}
                        <div className="flex items-start justify-between gap-1.5 mb-1.5">
                          <div className="flex flex-col">
                            <h3 className="font-outfit font-extrabold text-base sm:text-lg text-white tracking-tight leading-tight">
                              {planName}
                            </h3>
                            {planPeriod && (
                              <p className="text-[10px] text-zinc-400 font-mono font-semibold uppercase tracking-wider mt-0.5">
                                {planPeriod}
                              </p>
                            )}
                          </div>

                          {/* Etiqueta de Desconto no lugar de ATIVO */}
                          <span className="bg-gradient-to-r from-red-600 to-rose-600 border border-red-500/60 text-white font-outfit font-black text-[9px] px-2 py-0.5 rounded-md shadow-sm uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <Tag className="w-2.5 h-2.5 text-white fill-white/20" />
                            <span>{discountLabel}</span>
                          </span>
                        </div>

                        {/* Preço de Destaque estilo Painel ADM */}
                        <div className="my-2.5 pb-2.5 border-b border-zinc-800/80">
                          {planOriginalPrice && (
                            <span className="text-[11px] text-zinc-500 line-through font-semibold font-outfit block leading-none mb-1">
                              {planOriginalPrice}
                            </span>
                          )}
                          <div className="font-outfit font-black text-2xl sm:text-3xl text-cinemaGold tracking-tight leading-none">
                            {planPrice}
                          </div>
                          {planDesc && (
                            <p className="text-[11px] text-zinc-400 italic mt-1.5 font-outfit leading-tight">
                              {planDesc}
                            </p>
                          )}
                        </div>

                        {/* Lista de Benefícios */}
                        <ul className="flex flex-col gap-1.5 mb-4 text-[10.5px] sm:text-[11px] text-zinc-300">
                          {planFeatures.map((feat, idx) => (
                            <li key={idx} className="flex items-start gap-1.5 leading-snug">
                              <Check className="w-3.5 h-3.5 text-cinemaGold flex-shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectPlan(plan)}
                        className={`w-full py-2.5 rounded-xl font-outfit font-bold text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-md ${
                          isPopular
                            ? 'bg-cinemaGold hover:bg-amber-400 text-black shadow-cinemaGold/15'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
                        }`}
                      >
                        Assinar Agora
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Mobile Swipe Indicator Dots */}
              <div className="flex sm:hidden items-center justify-center gap-1.5 mt-2">
                {(plans || []).map((_, idx) => (
                  <div key={idx} className={`w-1.5 h-1.5 rounded-full ${idx === 1 ? 'bg-cinemaGold w-3' : 'bg-zinc-700'}`} />
                ))}
              </div>

              {/* Footer Trust Badges */}
              <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-center gap-4 text-[10px] text-zinc-400 font-outfit">
                <div className="flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-cinemaGold" />
                  <span>Sem fidelidade</span>
                </div>
                <div className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-cinemaGold" />
                  <span>Acesso imediato</span>
                </div>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
