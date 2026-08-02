import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://symbbodohpqldnhteddm.supabase.co';
export const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bWJib2RvaHBxbGRuaHRlZGRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2NTQ4MjAsImV4cCI6MjEwMTIzMDgyMH0.OKM6V2uGoLvwow1leA2cLZn6K38BLA8UZJqoSDGk0u4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = () => {
  return true;
};

export interface DBUserProfile {
  id?: string;
  username: string;
  name: string;
  avatar: string;
  created_at?: string;
  updated_at?: string;
}

// Fetch user profiles for a specific username from Supabase
export const getUserProfilesFromSupabase = async (username: string): Promise<DBUserProfile[]> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('username', username.toLowerCase())
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Error fetching profiles from Supabase:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('Supabase fetch profiles error:', err);
    return [];
  }
};

// Save (create or update) user profile in Supabase
export const saveUserProfileToSupabase = async (profile: DBUserProfile): Promise<DBUserProfile | null> => {
  try {
    const payload = {
      username: profile.username.toLowerCase(),
      name: profile.name,
      avatar: profile.avatar,
      updated_at: new Date().toISOString()
    };

    if (profile.id && profile.id.length > 20) { // Valid UUID or existing Supabase ID
      const { data, error } = await supabase
        .from('user_profiles')
        .update(payload)
        .eq('id', profile.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('user_profiles')
        .insert([{ ...payload, created_at: new Date().toISOString() }])
        .select('*')
        .single();
      if (error) throw error;
      return data;
    }
  } catch (err: any) {
    console.error('Supabase save profile error:', err.message || err);
    throw err;
  }
};

// Delete user profile from Supabase
export const deleteUserProfileFromSupabase = async (profileId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', profileId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Supabase delete profile error:', err);
    return false;
  }
};

// Upload avatar file to Supabase Storage with local data URL fallback
export const uploadAvatarToSupabase = async (file: File, username: string): Promise<string> => {
  try {
    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${username.toLowerCase()}_${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    // Try uploading to 'avatars' bucket in Supabase storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      if (publicUrlData?.publicUrl) {
        return publicUrlData.publicUrl;
      }
    }
  } catch (err) {
    console.warn('Storage upload error, using Data URL fallback:', err);
  }

  // Fallback: Convert image to Data URL (base64) for instant, local + database compatibility
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

export interface DBPlan {
  id: string;
  name?: string;
  nome?: string;
  price?: string;
  preco?: string;
  original_price?: string;
  preco_original?: string;
  old_price?: string;
  discount?: string;
  desconto?: string;
  period?: string;
  periodo?: string;
  description?: string;
  descricao?: string;
  is_popular?: boolean;
  popular?: boolean;
  destaque?: boolean;
  features?: string[];
  beneficios?: string[];
  benefits?: string[];
  sort_order?: number;
  ordem?: number;
  display_order?: number;
}

// Fetch plans from Supabase table 'plans'
export const getPlansFromSupabase = async (): Promise<DBPlan[]> => {
  try {
    const { data, error } = await supabase
      .from('plans')
      .select('*');

    if (error || !data || data.length === 0) {
      return [];
    }

    // Ordenar dinamicamente por sort_order, ordem ou display_order
    return [...data].sort((a, b) => {
      const orderA = a.sort_order ?? a.ordem ?? a.display_order ?? 99;
      const orderB = b.sort_order ?? b.ordem ?? b.display_order ?? 99;
      return orderA - orderB;
    });
  } catch (err) {
    console.warn('Error fetching plans from Supabase:', err);
    return [];
  }
};

// Save or update plan in Supabase
export const savePlanToSupabase = async (plan: DBPlan): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('plans')
      .upsert({
        id: plan.id,
        name: plan.name || plan.nome,
        price: plan.price || plan.preco,
        original_price: plan.original_price || plan.preco_original || plan.old_price,
        discount: plan.discount || plan.desconto,
        period: plan.period || plan.periodo || '/mês',
        description: plan.description || plan.descricao,
        is_popular: plan.is_popular ?? plan.popular ?? plan.destaque ?? false,
        features: plan.features || plan.beneficios || plan.benefits || [],
        sort_order: plan.sort_order ?? plan.ordem ?? plan.display_order ?? 1,
        updated_at: new Date().toISOString()
      });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Error saving plan to Supabase:', err);
    return false;
  }
};

export interface DBWatchItem {
  id?: string;
  username: string;
  content_id: string;
  title: string;
  category?: 'movie' | 'series' | string;
  thumbnail?: string;
  season?: number;
  episode?: number;
  episode_title?: string;
  progress_seconds?: number;
  duration_seconds?: number;
  progress_percentage?: number;
  duration_label?: string;
  added_time?: string;
  updated_at?: string;
}

// Fetch watch history for a user from Supabase
export const getWatchHistoryFromSupabase = async (username: string): Promise<DBWatchItem[]> => {
  if (!username) return [];
  try {
    const { data, error } = await supabase
      .from('watch_history')
      .select('*')
      .eq('username', username)
      .order('updated_at', { ascending: false });

    if (error || !data) return [];
    return data;
  } catch (err) {
    console.warn('Error fetching watch history from Supabase:', err);
    return [];
  }
};

// Save watch history item to Supabase
export const saveWatchItemToSupabase = async (item: DBWatchItem): Promise<boolean> => {
  if (!item.username || !item.content_id) return false;
  try {
    const payload = {
      username: item.username,
      content_id: item.content_id,
      title: item.title,
      category: item.category || 'series',
      thumbnail: item.thumbnail || '',
      season: item.season || 1,
      episode: item.episode || 1,
      episode_title: item.episode_title || '',
      progress_seconds: item.progress_seconds || 0,
      duration_seconds: item.duration_seconds || 0,
      progress_percentage: item.progress_percentage || 0,
      duration_label: item.duration_label || `${item.duration_seconds ? Math.floor(item.duration_seconds / 60) : 45}m`,
      added_time: 'Hoje',
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('watch_history')
      .upsert(payload, { onConflict: 'username,content_id,season,episode' });

    if (error) {
      // Fallback try without onConflict if table schema doesn't have unique constraint
      const { error: err2 } = await supabase.from('watch_history').upsert(payload);
      if (err2) console.warn('Supabase watch_history upsert notice:', err2.message);
    }
    return true;
  } catch (err) {
    console.warn('Error saving watch history to Supabase:', err);
    return false;
  }
};
