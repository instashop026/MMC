import io

path = 'artifacts/model-feed/src/app.ts'

# Read with proper line endings (CRLF)
with io.open(path, 'r', encoding='utf-8', newline='') as f:
    content = f.read()

# 1. Add getSupabase import after the zerostorage services import block
old_import = """import {
  collectMediaUnderFolder, listFiles, listFolders,
  revalidateZeroStorageFiles, sourceForPath,
} from './services/zerostorage';"""
new_import = """import {
  collectMediaUnderFolder, listFiles, listFolders,
  revalidateZeroStorageFiles, sourceForPath,
} from './services/zerostorage';
import { getSupabase } from './services/supabase';"""
if old_import in content:
    content = content.replace(old_import, new_import)
    print('Step 1: Added getSupabase import')
else:
    print('Step 1: Import block not found')

# 2. Fix the mute case in handleAction
old_mute = """      case 'comments': await openComments(id); break;
      case 'signout': await signOut(); state.user=null; state.profile=null; state.followed.clear(); state.followedStyles.clear(); go('/'); toast('You have signed out.'); break;"""
new_mute = """      case 'comments': await openComments(id); break;
      case 'mute': {
        if (!id) break;
        const p = state.posts.find(function(x) { return idOf(x) === id; });
        if (!p) break;
        const isMuted = bool(p, 'is_muted', 'isMuted', 'muted');
        const next = !isMuted;
        const { error } = await getSupabase()
          .from('posts')
          .update({ is_muted: next, muted: next })
          .eq('id', id);
        if (error) { actionError(error); break; }
        toast('Muted ' + (next ? 'on' : 'off'));
        await render(); break;
      }
      case 'signout': await signOut(); state.user=null; state.profile=null; state.followed.clear(); state.followedStyles.clear(); go('/'); toast('You have signed out.'); break;"""
if old_mute in content:
    content = content.replace(old_mute, new_mute)
    print('Step 2: Added mute case')
else:
    print('Step 2: Mute case NOT found!')
    idx = content.find("case 'comments'")
    if idx >= 0:
        print(repr(content[idx:idx+200]))

# Write back with CRLF line endings
with io.open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)

print('Done writing')
