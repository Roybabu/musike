package app.musike.android;

import android.content.Context;
import android.content.Intent;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Authorization and API requests stay on Android; access tokens never enter the WebView or disk. */
@CapacitorPlugin(name = "MusikeYouTube")
public class YouTubeAccountPlugin extends Plugin {
    private static final String SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
    private static final String PREFS = "youtube_account";
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;
    private String operation;

    @Override public void load() {
        launcher = getBridge().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), result -> {
            PluginCall call = pending;
            String task = operation;
            pending = null; operation = null;
            if (call == null) return;
            try {
                Intent data = result.getData();
                if (data == null) { call.reject("Google authorization was cancelled"); return; }
                AuthorizationResult authorization = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data);
                authorized(call, task, authorization);
            } catch (Exception e) { call.reject("Google authorization was cancelled or failed", e); }
        });
    }

    private boolean connected() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean("connected", false); }
    private void setConnected(boolean value) { getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean("connected", value).apply(); }
    @PluginMethod public void status(PluginCall call) { JSObject out = new JSObject(); out.put("connected", connected()); call.resolve(out); }
    @PluginMethod public void connect(PluginCall call) { authorize(call, "connect", true); }
    @PluginMethod public void sync(PluginCall call) {
        if (!connected()) { call.reject("Connect Google before syncing"); return; }
        authorize(call, "sync", false);
    }
    @PluginMethod public void forget(PluginCall call) { setConnected(false); call.resolve(); }
    @PluginMethod public void disconnect(PluginCall call) {
        if (!connected()) { call.resolve(); return; }
        authorize(call, "disconnect", false);
    }

    private void authorize(PluginCall call, String task, boolean interactive) {
        AuthorizationRequest request = AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(SCOPE))).build();
        getActivity().runOnUiThread(() -> Identity.getAuthorizationClient(getActivity()).authorize(request)
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive) {
                        if (task.equals("disconnect")) { setConnected(false); call.resolve(); }
                        else call.reject("Google permission needs to be renewed. Connect again.", "AUTH_REQUIRED");
                        return;
                    }
                    if (pending != null) { call.reject("Another Google authorization is in progress"); return; }
                    pending = call; operation = task;
                    try { launcher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build()); }
                    catch (Exception e) { pending = null; operation = null; call.reject("Could not open Google authorization", e); }
                } else authorized(call, task, result);
            }).addOnFailureListener(e -> call.reject("Google authorization failed. Check the Android OAuth configuration and Google Play services.", e)));
    }

    private void authorized(PluginCall call, String task, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null || token.isEmpty()) { call.reject("Google did not return an access token"); return; }
        if (task.equals("connect")) { setConnected(true); call.resolve(); return; }
        io.execute(() -> {
            try {
                if (task.equals("disconnect")) {
                    revoke(token); setConnected(false); call.resolve();
                } else {
                    JSObject out = new JSObject();
                    out.put("playlists", fetchPlaylists(token));
                    call.resolve(out);
                }
            } catch (Exception e) { call.reject("YouTube request failed: " + e.getMessage(), e); }
        });
    }

    private static String encode(String value) throws Exception { return URLEncoder.encode(value, "UTF-8"); }
    private static String request(String address, String token, boolean post) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(address).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(false);
        if (post) {
            c.setRequestMethod("POST"); c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            try (OutputStream out = c.getOutputStream()) { out.write(("token=" + encode(token)).getBytes("UTF-8")); }
        } else c.setRequestProperty("Authorization", "Bearer " + token);
        try {
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code + (code == 401 ? ": reconnect Google" : ""));
            try (InputStream in = c.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int n; int total = 0;
                while ((n = in.read(buffer)) != -1) { total += n; if (total > 8_000_000) throw new Exception("Response too large"); out.write(buffer, 0, n); }
                return out.toString("UTF-8");
            }
        } finally { c.disconnect(); }
    }
    private static void revoke(String token) throws Exception { request("https://oauth2.googleapis.com/revoke", token, true); }

    private static JSONArray pages(String base, String token) throws Exception {
        JSONArray all = new JSONArray(); String page = ""; Set<String> seen = new HashSet<>();
        do {
            if (!seen.add(page) || seen.size() > 1000) throw new Exception("Invalid YouTube pagination");
            JSONObject response = new JSONObject(request(base + (page.isEmpty() ? "" : "&pageToken=" + encode(page)), token, false));
            JSONArray items = response.optJSONArray("items");
            if (items != null) for (int i = 0; i < items.length(); i++) all.put(items.get(i));
            page = response.optString("nextPageToken", "");
        } while (!page.isEmpty());
        return all;
    }
    private static JSONArray fetchPlaylists(String token) throws Exception {
        String root = "https://www.googleapis.com/youtube/v3/";
        JSONArray playlists = pages(root + "playlists?part=snippet&mine=true&maxResults=50", token);
        JSONArray output = new JSONArray();
        for (int i = 0; i < playlists.length(); i++) {
            JSONObject p = playlists.getJSONObject(i); String id = p.optString("id");
            if (id.isEmpty()) continue;
            JSONObject snippet = p.optJSONObject("snippet"); if (snippet == null) continue;
            JSONArray entries = pages(root + "playlistItems?part=snippet&maxResults=50&playlistId=" + encode(id), token);
            JSONArray tracks = new JSONArray();
            for (int j = 0; j < entries.length(); j++) {
                JSONObject item = entries.getJSONObject(j).optJSONObject("snippet"); if (item == null) continue;
                JSONObject resource = item.optJSONObject("resourceId"); if (resource == null) continue;
                String video = resource.optString("videoId"); if (!video.matches("[A-Za-z0-9_-]{11}")) continue;
                String title = item.optString("title", "Untitled");
                if (title.equals("Deleted video") || title.equals("Private video")) continue;
                JSONObject thumb = item.optJSONObject("thumbnails");
                JSONObject best = thumb == null ? null : thumb.optJSONObject("medium");
                String artwork = best == null ? "" : best.optString("url", "");
                JSONObject track = new JSONObject(); track.put("id", video); track.put("title", title);
                track.put("artist", item.optString("videoOwnerChannelTitle", "")); track.put("duration", 0);
                track.put("thumb", artwork); track.put("art", artwork); track.put("kind", "video"); tracks.put(track);
            }
            JSONObject playlist = new JSONObject(); playlist.put("id", id); playlist.put("name", snippet.optString("title", "Playlist")); playlist.put("tracks", tracks); output.put(playlist);
        }
        return output;
    }
    @Override protected void handleOnDestroy() { io.shutdown(); }
}
