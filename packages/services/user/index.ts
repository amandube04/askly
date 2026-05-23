import { db } from "@repo/database";
import { usersTable } from "@repo/database/schema";
import { eq } from "@repo/database";
import { env } from "../env";
import { googleOAuth2Client } from "../clients/google-oauth";
import { GetAuthenticationMethodOutputSchema } from "./model";

class UserService {
  public isGoogleOAuthConfigured(): boolean {
    return !!(
      env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REDIRECT_URI
    );
  }

  public getGoogleOAuthAuthUrl(): string | null {
    if (!this.isGoogleOAuthConfigured()) return null;

    return googleOAuth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: ["openid", "email", "profile"],
    });
  }

  public async getAuthenticationMethods(): Promise<
    ReadonlyArray<GetAuthenticationMethodOutputSchema>
  > {
    const supportedAuthenticationProviders: GetAuthenticationMethodOutputSchema[] = [];

    const isGoogleConfigured = this.isGoogleOAuthConfigured();

    if (isGoogleConfigured) {
      const url = this.getGoogleOAuthAuthUrl();
      if (!url) return supportedAuthenticationProviders;
      supportedAuthenticationProviders.push({
        provider: "GOOGLE_OAUTH",
        displayName: "Google",
        displayText: "Signin with Google",
        authUrl: url,
      });
    }

    return supportedAuthenticationProviders;
  }

  public async loginOrCreateWithGoogleAuthorizationCode(code: string): Promise<{
    id: string;
    email: string;
    fullName: string;
  }> {
    if (!this.isGoogleOAuthConfigured()) {
      throw new Error("Google OAuth is not configured.");
    }

    const tokenResponse = await googleOAuth2Client.getToken(code);
    const idToken = tokenResponse.tokens.id_token;
    if (!idToken) {
      throw new Error("Google OAuth token exchange failed.");
    }

    const ticket = await googleOAuth2Client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_OAUTH_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new Error("Google account email is unavailable.");
    }

    const email = payload.email.toLowerCase();
    const fullName = payload.name?.trim() || email.split("@")[0] || "Google User";
    const profileImageUrl = payload.picture || null;

    const [existingUser] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
      })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingUser) {
      await db
        .update(usersTable)
        .set({
          fullName,
          profileImageUrl,
          emailVerified: true,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, existingUser.id));

      return {
        id: existingUser.id,
        email: existingUser.email,
        fullName,
      };
    }

    const [createdUser] = await db
      .insert(usersTable)
      .values({
        fullName,
        email,
        profileImageUrl,
        role: "creator",
        emailVerified: true,
      })
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        fullName: usersTable.fullName,
      });

    if (!createdUser) {
      throw new Error("Unable to create user from Google OAuth.");
    }

    return createdUser;
  }
}

export default UserService;
