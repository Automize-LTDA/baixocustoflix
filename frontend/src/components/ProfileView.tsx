import React, { useState, useEffect, useRef } from 'react';
import { User, Tv, Check, Upload, Camera, Loader2 } from 'lucide-react';
import type { UserProfile } from '../types';
import { AVATAR_LIBRARY } from './ProfileSelection';
import { uploadAvatarToSupabase } from '../lib/supabase';

interface ProfileViewProps {
  profile: UserProfile;
  onUpdateProfile: (updated: UserProfile) => Promise<void>;
  onLogout?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  onUpdateProfile,
  onLogout
}) => {
  const [name, setName] = useState(profile.name);
  const [username, setUsername] = useState(profile.username);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [streamingQuality, setStreamingQuality] = useState(profile.streamingQuality);
  const [autoPlayTrailers, setAutoPlayTrailers] = useState(profile.autoPlayTrailers);
  const [preferredLanguage, setPreferredLanguage] = useState(profile.preferredLanguage);
  
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync state if initial profile changes
  useEffect(() => {
    setName(profile.name);
    setUsername(profile.username);
    setAvatar(profile.avatar);
    setStreamingQuality(profile.streamingQuality);
    setAutoPlayTrailers(profile.autoPlayTrailers);
    setPreferredLanguage(profile.preferredLanguage);
  }, [profile]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const uploadedUrl = await uploadAvatarToSupabase(file, username || 'user');
      setAvatar(uploadedUrl);
    } catch (err) {
      console.error('Error uploading photo:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    await onUpdateProfile({
      name,
      username,
      avatar,
      streamingQuality,
      autoPlayTrailers,
      preferredLanguage
    });

    setIsSaving(false);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 flex flex-col gap-8 relative pb-28 md:pb-12">
      {/* Page Header */}
      <div>
        <h2 className="font-outfit font-extrabold text-2xl md:text-4xl text-white tracking-tight">
          Minha Conta
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Gerencie suas preferências de exibição, foto de perfil e dados da conta.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Side: Avatar selector & Photo upload */}
        <div className="lg:col-span-4 flex flex-col gap-6 p-6 rounded-2xl bg-obsidian-card border border-obsidian-border/50 text-center items-center">
          <div className="relative group">
            <div className="w-32 h-32 rounded-2xl border-2 border-cinemaGold overflow-hidden object-cover shadow-premium-glow group-hover:scale-105 transition-transform duration-300 relative">
              <img
                src={avatar || AVATAR_LIBRARY[0]}
                alt="Avatar do Usuário"
                className="w-full h-full object-cover"
              />

              {isUploadingPhoto && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cinemaGold gap-1">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-white">Enviando...</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition-opacity duration-200 text-white cursor-pointer"
              >
                <Camera className="w-6 h-6 text-cinemaGold" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white">Alterar Foto</span>
              </button>
            </div>
          </div>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingPhoto}
            className="flex items-center gap-2 text-xs font-semibold text-cinemaGold hover:text-white bg-zinc-900 border border-cinemaGold/30 hover:border-cinemaGold px-3.5 py-2 rounded-xl transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Foto da Galeria Pessoal</span>
          </button>

          <div>
            <h3 className="font-outfit font-bold text-lg text-slate-100">{name || "Usuário"}</h3>
            <p className="text-xs text-cinemaGold font-semibold uppercase tracking-wider mt-0.5">Assinante Premium</p>
          </div>

          {/* Avatar predefinido selection */}
          <div className="w-full border-t border-obsidian-border/40 pt-4 flex flex-col gap-2">
            <span className="text-[11px] font-semibold text-slate-400 font-outfit uppercase tracking-wider">
              Avatares Padrão
            </span>
            <div className="grid grid-cols-4 gap-2 justify-center">
              {AVATAR_LIBRARY.slice(0, 8).map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatar(url)}
                  className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition-all ${
                    avatar === url ? 'border-cinemaGold scale-110 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {onLogout && (
            <div className="w-full border-t border-obsidian-border/40 pt-4 mt-2">
              <button
                type="button"
                onClick={onLogout}
                className="w-full py-2.5 rounded-xl border border-rose-500/20 hover:border-rose-500/40 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 font-outfit font-bold text-xs uppercase tracking-wider transition-all duration-300 active:scale-95 cursor-pointer"
              >
                Sair da Conta
              </button>
            </div>
          )}

        </div>

        {/* Right Side: Settings Fields */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Section: Personal Info */}
          <div className="p-6 rounded-2xl bg-obsidian-card border border-obsidian-border/50 flex flex-col gap-4">
            <h4 className="font-outfit font-bold text-slate-300 text-base flex items-center gap-2">
              <User className="w-4 h-4 text-cinemaGold" />
              <span>Informações Pessoais</span>
            </h4>
            
            <div className="flex flex-col gap-4">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-semibold font-outfit uppercase">Nome do Perfil</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-4 pr-4 py-3 bg-cinemaCharcoal/40 hover:bg-cinemaCharcoal/60 focus:bg-cinemaCharcoal border border-obsidian-border/80 focus:border-cinemaGold/40 rounded-xl text-sm text-slate-200 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Preferences */}
          <div className="p-6 rounded-2xl bg-obsidian-card border border-obsidian-border/50 flex flex-col gap-5">
            <h4 className="font-outfit font-bold text-slate-300 text-base flex items-center gap-2">
              <Tv className="w-4 h-4 text-cinemaGold" />
              <span>Transmissão & Exibição</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Streaming Quality */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-semibold font-outfit uppercase">Qualidade do Vídeo</label>
                <select
                  value={streamingQuality}
                  onChange={(e) => setStreamingQuality(e.target.value)}
                  className="w-full px-4 py-3 bg-cinemaCharcoal/40 border border-obsidian-border/80 focus:border-cinemaGold/40 rounded-xl text-sm text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="Móvel Econômico">Econômico (SD 480p)</option>
                  <option value="Padrão HD">Padrão (HD 720p)</option>
                  <option value="Alta Definição 1080p">Alta Definição (FHD 1080p)</option>
                  <option value="Premium 4K">Premium Cinematic (UHD 4K)</option>
                </select>
              </div>

              {/* Language */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 font-semibold font-outfit uppercase">Idioma Preferido</label>
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value)}
                  className="w-full px-4 py-3 bg-cinemaCharcoal/40 border border-obsidian-border/80 focus:border-cinemaGold/40 rounded-xl text-sm text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="Portuguese">Português (Brasil)</option>
                  <option value="English">English</option>
                  <option value="Spanish">Español</option>
                </select>
              </div>
            </div>

            {/* Toggle Auto-play */}
            <div className="flex items-center justify-between pt-2 border-t border-obsidian-border/40">
              <div>
                <span className="text-sm font-semibold text-slate-200 block font-outfit">Reproduzir Trailers Automaticamente</span>
                <span className="text-xs text-slate-400">Exibir prévia em vídeo ao navegar pelos itens</span>
              </div>

              <button
                type="button"
                onClick={() => setAutoPlayTrailers(!autoPlayTrailers)}
                className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 focus:outline-none cursor-pointer ${
                  autoPlayTrailers ? 'bg-cinemaGold' : 'bg-zinc-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-black transform transition-transform duration-300 ${
                    autoPlayTrailers ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={isSaving}
              className="px-8 py-3.5 bg-cinemaGold hover:bg-amber-400 text-obsidian font-outfit font-bold text-xs uppercase tracking-wider rounded-xl shadow-premium-glow hover:scale-105 active:scale-95 transition-all duration-300 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar Alterações</span>
              )}
            </button>

            {showSavedToast && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold font-outfit animate-fade-in">
                <Check className="w-4 h-4" />
                <span>Perfil atualizado com sucesso!</span>
              </span>
            )}
          </div>

        </div>

      </form>
    </div>
  );
};
