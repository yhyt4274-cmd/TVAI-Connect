-- ==========================================
-- 1. EXTENSIONS & CLEANUP
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversation_members CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.friendships CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ==========================================
-- 2. PROFILES TABLE
-- ==========================================
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    avatar_url TEXT DEFAULT '👤',
    status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away')),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, username, avatar_url)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'avatar_url', '👤')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 3. FRIENDSHIPS TABLE (Strict Constraints)
-- ==========================================
CREATE TABLE public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT cannot_befriend_self CHECK (requester_id <> receiver_id)
);

-- Prevent reciprocal duplicates elegantly using a unique index
CREATE UNIQUE INDEX friendships_prevent_duplicates_idx ON public.friendships (
    LEAST(requester_id, receiver_id), 
    GREATEST(requester_id, receiver_id)
);

-- ==========================================
-- 4. CONVERSATIONS & MEMBERS
-- ==========================================
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    is_group BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.conversation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- ==========================================
-- 5. MESSAGES TABLE
-- ==========================================
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL CHECK (char_length(trim(content)) > 0),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Update conversation timestamp on new message
CREATE OR REPLACE FUNCTION public.update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.conversations
    SET updated_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_new_message_update_conv
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.update_conversation_timestamp();

-- ==========================================
-- 6. RPC: GET OR CREATE PRIVATE CONVERSATION
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(partner_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_user_id UUID := auth.uid();
    existing_conv_id UUID;
BEGIN
    -- Check if 1v1 conversation already exists
    SELECT cm1.conversation_id INTO existing_conv_id
    FROM public.conversation_members cm1
    JOIN public.conversation_members cm2 ON cm1.conversation_id = cm2.conversation_id
    JOIN public.conversations c ON c.id = cm1.conversation_id
    WHERE cm1.user_id = current_user_id
      AND cm2.user_id = partner_id
      AND c.is_group = FALSE
    LIMIT 1;

    -- If not, create one atomically
    IF existing_conv_id IS NULL THEN
        INSERT INTO public.conversations (is_group)
        VALUES (FALSE)
        RETURNING id INTO existing_conv_id;

        INSERT INTO public.conversation_members (conversation_id, user_id)
        VALUES 
            (existing_conv_id, current_user_id),
            (existing_conv_id, partner_id);
    END IF;

    RETURN existing_conv_id;
END;
$$;

-- ==========================================
-- 7. PERFORMANCE INDEXES
-- ==========================================
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_friendships_lookup ON public.friendships(requester_id, receiver_id, status);
CREATE INDEX idx_conv_members_lookup ON public.conversation_members(user_id, conversation_id);
CREATE INDEX idx_messages_ordered ON public.messages(conversation_id, created_at DESC);

-- ==========================================
-- 8. SECURITY & RLS POLICIES
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Profiles Policies
CREATE POLICY "Profiles are readable by authenticated users"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can edit their own profile"
ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Friendships Policies
CREATE POLICY "Users can view their friendships"
ON public.friendships FOR SELECT TO authenticated 
USING (auth.uid() = requester_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send friend requests"
ON public.friendships FOR INSERT TO authenticated 
WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Only receivers can accept friend requests"
ON public.friendships FOR UPDATE TO authenticated 
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id AND status IN ('accepted', 'blocked'));

-- Conversations Policies
CREATE POLICY "Users can see conversations they belong to"
ON public.conversations FOR SELECT TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members 
        WHERE conversation_members.conversation_id = id AND conversation_members.user_id = auth.uid()
    )
);

-- Conversation Members Policies
CREATE POLICY "Members can view membership details"
ON public.conversation_members FOR SELECT TO authenticated 
USING (
    user_id = auth.uid() OR 
    EXISTS (
        SELECT 1 FROM public.conversation_members AS cm 
        WHERE cm.conversation_id = conversation_id AND cm.user_id = auth.uid()
    )
);

-- Messages Policies
CREATE POLICY "Members can read messages"
ON public.messages FOR SELECT TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.conversation_members 
        WHERE conversation_members.conversation_id = conversation_id AND conversation_members.user_id = auth.uid()
    )
);

CREATE POLICY "Members can post messages"
ON public.messages FOR INSERT TO authenticated 
WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
        SELECT 1 FROM public.conversation_members 
        WHERE conversation_members.conversation_id = conversation_id AND conversation_members.user_id = auth.uid()
    )
);