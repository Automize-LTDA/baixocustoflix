import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Plus, Trash2, Upload, Camera, Loader2, AlertCircle } from 'lucide-react';
import type { UserProfile } from '../types';
import {
  getUserProfilesFromSupabase,
  saveUserProfileToSupabase,
  deleteUserProfileFromSupabase,
  uploadAvatarToSupabase,
  type DBUserProfile
} from '../lib/supabase';

interface ProfileItem {
  id: string;
  name: string;
  avatar: string;
}

interface ProfileSelectionProps {
  onSelectProfile: (name: string, avatar: string) => void;
  currentUser: UserProfile | null;
}

// Netflix-style colored vector smileys (8 colors)
export const AVATAR_LIBRARY = [
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#1b8cff"/><rect x="28" y="34" width="10" height="16" rx="5" fill="white"/><rect x="62" y="34" width="10" height="16" rx="5" fill="white"/><path d="M22 62 C 22 76, 78 76, 78 62" stroke="white" stroke-width="7" stroke-linecap="round" fill="none"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#e50914"/><rect x="28" y="34" width="10" height="16" rx="5" fill="white"/><rect x="62" y="34" width="10" height="16" rx="5" fill="white"/><path d="M22 62 C 22 76, 78 76, 78 62" stroke="white" stroke-width="7" stroke-linecap="round" fill="none"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#2e7d32"/><rect x="28" y="34" width="10" height="16" rx="5" fill="white"/><rect x="62" y="34" width="10" height="16" rx="5" fill="white"/><path d="M22 62 C 22 76, 78 76, 78 62" stroke="white" stroke-width="7" stroke-linecap="round" fill="none"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#f5b324"/><rect x="28" y="34" width="10" height="16" rx="5" fill="white"/><rect x="62" y="34" width="10" height="16" rx="5" fill="white"/><path d="M22 62 C 22 76, 78 76, 78 62" stroke="white" stroke-width="7" stroke-linecap="round" fill="none"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#8a3ffc"/><rect x="28" y="34" width="10" height="16" rx="5" fill="white"/><rect x="62" y="34" width="10" height="16" rx="5" fill="white"/><path d="M22 62 C 22 76, 78 76, 78 62" stroke="white" stroke-width="7" stroke-linecap="round" fill="none"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#ff7eb6"/><rect x="28" y="34" width="10" height="16" rx="5" fill="white"/><rect x="62" y="34" width="10" height="16" rx="5" fill="white"/><path d="M22 62 C 22 76, 78 76, 78 62" stroke="white" stroke-width="7" stroke-linecap="round" fill="none"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#ff7605"/><rect x="28" y="34" width="10" height="16" rx="5" fill="white"/><rect x="62" y="34" width="10" height="16" rx="5" fill="white"/><path d="M22 62 C 22 76, 78 76, 78 62" stroke="white" stroke-width="7" stroke-linecap="round" fill="none"/></svg>')}`,
  `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="#00a7a7"/><rect x="28" y="34" width="10" height="16" rx="5" fill="white"/><rect x="62" y="34" width="10" height="16" rx="5" fill="white"/><path d="M22 62 C 22 76, 78 76, 78 62" stroke="white" stroke-width="7" stroke-linecap="round" fill="none"/></svg>')}`
];

const MAX_PROFILES_PER_ACCOUNT = 3;

export const ProfileSelection: React.FC<ProfileSelectionProps> = ({ onSelectProfile, currentUser }) => {
  const username = currentUser?.username || localStorage.getItem('loggedUsername') || 'guest';
  const storageKey = `bc_profiles_${username}`;

  const [profiles, setProfiles] = useState<ProfileItem[]>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : [];
  });

  const [isLoadingSupabase, setIsLoadingSupabase] = useState(true);
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileItem | null>(null);
  
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load profiles from Supabase DB on component mount
  useEffect(() => {
    let isMounted = true;
    const fetchSupabaseProfiles = async () => {
      setIsLoadingSupabase(true);
      try {
        const dbProfiles = await getUserProfilesFromSupabase(username);
        if (isMounted && dbProfiles && dbProfiles.length > 0) {
          const mapped: ProfileItem[] = dbProfiles.map(p => ({
            id: p.id || String(Date.now()),
            name: p.name,
            avatar: p.avatar
          }));
          setProfiles(mapped);
          localStorage.setItem(storageKey, JSON.stringify(mapped));
        }
      } catch (err) {
        console.error('Error fetching profiles:', err);
      } finally {
        if (isMounted) setIsLoadingSupabase(false);
      }
    };

    fetchSupabaseProfiles();

    return () => {
      isMounted = false;
    };
  }, [username, storageKey]);

  const handleProfileClick = (profile: ProfileItem) => {
    if (isEditingMode) {
      setEditingProfile(profile);
      setEditName(profile.name);
      setEditAvatar(profile.avatar);
      setErrorMsg(null);
    } else {
      onSelectProfile(profile.name, profile.avatar);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor, selecione uma imagem válida.');
      return;
    }

    setIsUploadingPhoto(true);
    setErrorMsg(null);

    try {
      const uploadedUrl = await uploadAvatarToSupabase(file, username);
      setEditAvatar(uploadedUrl);
    } catch (err) {
      console.error('Upload failed:', err);
      setErrorMsg('Erro ao carregar a foto da galeria. Tente novamente.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      setErrorMsg('O nome do perfil não pode estar vazio.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      let savedDbProfile: DBUserProfile | null = null;
      try {
        savedDbProfile = await saveUserProfileToSupabase({
          id: editingProfile?.id,
          username: username,
          name: editName.trim(),
          avatar: editAvatar
        });
      } catch (err: any) {
        if (err.message && err.message.includes('3 perfis')) {
          setErrorMsg('Limite máximo de 3 perfis por conta atingido.');
          setIsSaving(false);
          return;
        }
      }

      const finalId = savedDbProfile?.id || editingProfile?.id || String(Date.now());
      const updatedProfile: ProfileItem = {
        id: finalId,
        name: editName.trim(),
        avatar: editAvatar
      };

      const updated = profiles.map(p => p.id === editingProfile?.id ? updatedProfile : p);
      if (!profiles.some(p => p.id === editingProfile?.id)) {
        updated.push(updatedProfile);
      }

      setProfiles(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setEditingProfile(null);
    } catch (err) {
      console.error('Save error:', err);
      setErrorMsg('Erro ao salvar no banco de dados.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!editingProfile) return;

    setIsSaving(true);
    try {
      if (editingProfile.id && editingProfile.id.length > 20) {
        await deleteUserProfileFromSupabase(editingProfile.id);
      }

      const updated = profiles.filter(p => p.id !== editingProfile.id);
      setProfiles(updated);
      localStorage.setItem(storageKey, JSON.stringify(updated));
      setEditingProfile(null);
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddProfile = () => {
    if (profiles.length >= MAX_PROFILES_PER_ACCOUNT) {
      setErrorMsg(`Cada conta pode ter no máximo ${MAX_PROFILES_PER_ACCOUNT} perfis.`);
      return;
    }

    const newId = `new_${Date.now()}`;
    const newProfile: ProfileItem = {
      id: newId,
      name: `Perfil ${profiles.length + 1}`,
      avatar: AVATAR_LIBRARY[profiles.length % AVATAR_LIBRARY.length]
    };

    setEditingProfile(newProfile);
    setEditName(newProfile.name);
    setEditAvatar(newProfile.avatar);
    setErrorMsg(null);
  };

  if (editingProfile) {
    return (
      <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-black text-white select-none overflow-y-auto py-8 z-50">
        <div className="flex flex-col items-start gap-6 z-10 px-6 max-w-xl w-full my-auto">
          <h2 className="font-outfit font-bold text-3xl md:text-5xl text-slate-100 tracking-tight border-b border-zinc-800 pb-4 w-full">
            {editingProfile.id.startsWith('new_') ? 'Criar Perfil' : 'Editar Perfil'}
          </h2>
          
          {errorMsg && (
            <div className="w-full bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex flex-col md:flex-row items-center md:items-start gap-8 w-full py-4 border-b border-zinc-800 pb-8">
            {/* Avatar Preview + Gallery Upload Button */}
            <div className="flex flex-col items-center gap-3 flex-shrink-0">
              <div className="relative w-36 h-36 rounded-2xl overflow-hidden shadow-lg border-2 border-cinemaGold shadow-premium-glow group">
                <img src={editAvatar} alt="Editar Avatar" className="w-full h-full object-cover select-none" />
                
                {isUploadingPhoto && (
                  <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-cinemaGold gap-2">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white">Enviando...</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1.5 transition-all duration-200 text-white cursor-pointer"
                >
                  <Camera className="w-7 h-7 text-cinemaGold" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white">Alterar Foto</span>
                </button>
              </div>

              {/* Hidden File Input for Custom Gallery Upload */}
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
                className="flex items-center gap-2 text-xs font-semibold text-cinemaGold hover:text-white bg-zinc-900 border border-cinemaGold/30 hover:border-cinemaGold px-3 py-1.5 rounded-lg transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Enviar da Galeria</span>
              </button>
            </div>
            
            <div className="flex-1 flex flex-col gap-4 w-full">
              <div>
                <label className="block text-xs font-outfit uppercase tracking-widest text-zinc-400 mb-1">
                  Nome do Perfil
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={15}
                  className="w-full bg-zinc-900 text-white font-outfit text-lg px-4 py-3 rounded-xl border border-zinc-800 focus:border-cinemaGold focus:outline-none transition-all duration-300 shadow-inner"
                  placeholder="Nome do perfil"
                />
              </div>
              
              <div className="text-xs text-zinc-400 font-outfit uppercase tracking-widest mt-1">
                Ou escolha um avatar predefinido:
              </div>
              <div className="grid grid-cols-4 gap-2.5">
                {AVATAR_LIBRARY.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setEditAvatar(url)}
                    className={`w-11 h-11 rounded-xl overflow-hidden border-2 transition-all duration-200 transform hover:scale-105 ${
                      editAvatar === url ? 'border-cinemaGold scale-110 shadow-[0_0_12px_rgba(245,179,36,0.4)]' : 'border-transparent hover:border-zinc-500'
                    }`}
                  >
                    <img src={url} alt={`Avatar ${idx}`} className="w-full h-full object-cover select-none" />
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 w-full font-outfit pt-2">
            <button
              onClick={handleSaveProfile}
              disabled={isSaving || isUploadingPhoto}
              className="flex items-center gap-2 px-7 py-3 bg-cinemaGold text-black font-bold text-xs tracking-wider uppercase rounded-xl hover:bg-amber-400 transition-all duration-300 active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Salvar</span>
            </button>
            <button
              onClick={() => { setEditingProfile(null); setErrorMsg(null); }}
              disabled={isSaving}
              className="px-6 py-3 border border-zinc-700 text-zinc-400 hover:text-white hover:border-white font-semibold text-xs tracking-wider uppercase rounded-xl transition-all duration-300 active:scale-95"
            >
              Cancelar
            </button>
            {!editingProfile.id.startsWith('new_') && (
              <button
                onClick={handleDeleteProfile}
                disabled={isSaving}
                className="ml-auto flex items-center gap-2 px-5 py-3 bg-red-950/40 border border-red-800/60 text-red-400 hover:bg-red-600 hover:text-white font-semibold text-xs tracking-wider uppercase rounded-xl transition-all duration-300 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </button>
            )}
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-black to-black z-0 pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vh] bg-cinemaGold/5 rounded-full filter blur-[150px] pointer-events-none" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col items-center justify-center bg-black text-white select-none overflow-y-auto py-12">
      <div className="flex flex-col items-center gap-10 z-10 px-4 max-w-5xl w-full">
        
        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center flex flex-col items-center"
        >
          <h1 className="font-outfit font-bold text-3xl md:text-5xl text-slate-100 tracking-tight">
            {isEditingMode ? "Gerenciar Perfis:" : "Quem está assistindo?"}
          </h1>
          <p className="text-xs text-zinc-500 mt-2 font-outfit">
            Máximo de {MAX_PROFILES_PER_ACCOUNT} perfis por conta ({profiles.length}/{MAX_PROFILES_PER_ACCOUNT} usados)
          </p>
        </motion.div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        )}

        {isLoadingSupabase && profiles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-zinc-400 py-12">
            <Loader2 className="w-8 h-8 text-cinemaGold animate-spin" />
            <span className="text-xs font-semibold">Carregando perfis...</span>
          </div>
        ) : (
          /* Profiles Grid */
          <div className="flex flex-wrap justify-center gap-6 md:gap-8 max-w-4xl">
            {profiles.map((profile, index) => (
              <motion.div
                key={profile.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => handleProfileClick(profile)}
                className="flex flex-col items-center gap-4 cursor-pointer group"
              >
                {/* Profile Avatar Card */}
                <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-2xl overflow-hidden border-2 border-transparent group-hover:border-cinemaGold transition-all duration-300 transform group-hover:scale-105 active:scale-95 shadow-lg group-hover:shadow-premium-glow">
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    className={`w-full h-full object-cover select-none transition-all duration-300 ${isEditingMode ? 'brightness-50' : ''}`}
                    draggable={false}
                  />
                  
                  {/* Pencil overlay when editing */}
                  {isEditingMode && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/20 transition-all duration-200">
                      <div className="bg-black/70 border border-white/30 rounded-full p-2.5 shadow-md">
                        <Pencil className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Profile Name */}
                <span className="font-outfit font-medium text-sm md:text-base text-slate-400 group-hover:text-slate-100 transition-colors duration-300">
                  {profile.name}
                </span>
              </motion.div>
            ))}

            {/* Add Profile Card when under 3 profile limit */}
            {(isEditingMode || profiles.length === 0) && profiles.length < MAX_PROFILES_PER_ACCOUNT && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleAddProfile}
                className="flex flex-col items-center gap-4 cursor-pointer group"
              >
                <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-2xl overflow-hidden border-2 border-dashed border-zinc-700 hover:border-cinemaGold hover:bg-zinc-900/30 flex items-center justify-center transition-all duration-300 transform group-hover:scale-105 active:scale-95 shadow-md">
                  <Plus className="w-8 h-8 text-zinc-500 group-hover:text-cinemaGold transition-colors" />
                </div>
                <span className="font-outfit font-medium text-sm md:text-base text-zinc-500 group-hover:text-cinemaGold transition-colors duration-300">
                  Adicionar Perfil
                </span>
              </motion.div>
            )}
          </div>
        )}

        {/* Manage profiles button */}
        {profiles.length > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            onClick={() => setIsEditingMode(!isEditingMode)}
            className={`px-6 py-2.5 mt-4 border font-outfit text-sm font-semibold tracking-wider uppercase transition-colors duration-300 rounded-lg active:scale-95 cursor-pointer ${
              isEditingMode 
                ? 'bg-white border-white text-black hover:bg-cinemaGold hover:border-cinemaGold' 
                : 'border-slate-600 hover:border-slate-300 text-slate-400 hover:text-slate-200'
            }`}
          >
            {isEditingMode ? "Concluído" : "Gerenciar Perfis"}
          </motion.button>
        )}

      </div>

      {/* Cinematic Backdrop Glow */}
      <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-black to-black z-0 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vh] bg-cinemaGold/5 rounded-full filter blur-[150px] pointer-events-none" />
    </div>
  );
};
