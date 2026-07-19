// Hleður APNs-push-lykli (.p8) upp á Expo og tengir við iOS-app skilríkin.
// Notkun: EXPO_TOKEN=... node upload-push-key.mjs <slóð.p8> <KEY_ID>
import { readFileSync } from "node:fs";

const TOKEN = process.env.EXPO_TOKEN;
const [,, p8Path, keyId] = process.argv;
const TEAM_ID = "X32THG4FS9";
const APP_ID = "cb85e512-e526-4baa-b296-38162af185e4"; // @reir-team/timaverk
const BUNDLE = "is.reir.timaverk";
const ACCOUNT_NAME = "reir-team";

if (!TOKEN || !p8Path || !keyId) {
  console.error("Notkun: EXPO_TOKEN=... node upload-push-key.mjs <slóð.p8> <KEY_ID>");
  process.exit(1);
}
const keyP8 = readFileSync(p8Path, "utf8");

async function gql(query, variables = {}) {
  const res = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
}

// 1) Account id + núverandi Apple-teymi
const acc = await gql(
  `query($name: String!) {
     account { byName(accountName: $name) {
       id
       appleTeams { id appleTeamIdentifier }
       appleAppIdentifiers { id bundleIdentifier }
     } }
   }`,
  { name: ACCOUNT_NAME }
);
const account = acc.account.byName;
console.log("✅ Account:", account.id);

// 2) Apple team (finna eða stofna)
let team = account.appleTeams.find((t) => t.appleTeamIdentifier === TEAM_ID);
if (!team) {
  const d = await gql(
    `mutation($accountId: ID!, $input: AppleTeamInput!) {
       appleTeam { createAppleTeam(accountId: $accountId, appleTeamInput: $input) { id appleTeamIdentifier } }
     }`,
    { accountId: account.id, input: { appleTeamIdentifier: TEAM_ID, appleTeamName: "Reir" } }
  );
  team = d.appleTeam.createAppleTeam;
  console.log("✅ Apple team stofnað:", team.id);
} else {
  console.log("✅ Apple team til:", team.id);
}

// 3) Push-lykillinn sjálfur
const pk = await gql(
  `mutation($accountId: ID!, $input: ApplePushKeyInput!) {
     applePushKey { createApplePushKey(accountId: $accountId, applePushKeyInput: $input) { id keyIdentifier } }
   }`,
  { accountId: account.id, input: { keyP8, keyIdentifier: keyId, appleTeamId: team.id } }
);
const pushKey = pk.applePushKey.createApplePushKey;
console.log("✅ Push-lykill skráður hjá Expo:", pushKey.id, pushKey.keyIdentifier);

// 4) Apple app identifier (finna eða stofna)
let appIdent = account.appleAppIdentifiers.find((a) => a.bundleIdentifier === BUNDLE);
if (!appIdent) {
  const d = await gql(
    `mutation($accountId: ID!, $input: AppleAppIdentifierInput!) {
       appleAppIdentifier { createAppleAppIdentifier(accountId: $accountId, appleAppIdentifierInput: $input) { id bundleIdentifier } }
     }`,
    { accountId: account.id, input: { bundleIdentifier: BUNDLE, appleTeamId: team.id } }
  );
  appIdent = d.appleAppIdentifier.createAppleAppIdentifier;
  console.log("✅ App identifier stofnað:", appIdent.id);
} else {
  console.log("✅ App identifier til:", appIdent.id);
}

// 5) iOS app credentials: uppfæra ef til, annars stofna
const existing = await gql(
  `query($id: String!) {
     app { byId(appId: $id) { iosAppCredentials { id pushKey { id keyIdentifier } } } }
   }`,
  { id: APP_ID }
);
const creds = existing.app.byId.iosAppCredentials;
if (creds.length > 0) {
  const upd = await gql(
    `mutation($id: ID!, $pushKeyId: ID!) {
       iosAppCredentials { setPushKey(id: $id, pushKeyId: $pushKeyId) {
         id pushKey { id keyIdentifier }
       } }
     }`,
    { id: creds[0].id, pushKeyId: pushKey.id }
  );
  console.log("✅✅ Push-lykli SKIPT ÚT:", JSON.stringify(upd.iosAppCredentials.setPushKey));
} else {
  const cred = await gql(
    `mutation($appId: ID!, $appleAppIdentifierId: ID!, $input: IosAppCredentialsInput!) {
       iosAppCredentials { createIosAppCredentials(appId: $appId, appleAppIdentifierId: $appleAppIdentifierId, iosAppCredentialsInput: $input) {
         id pushKey { id keyIdentifier }
       } }
     }`,
    { appId: APP_ID, appleAppIdentifierId: appIdent.id, input: { appleTeamId: team.id, pushKeyId: pushKey.id } }
  );
  console.log("✅✅ iOS app credentials tengd:", JSON.stringify(cred.iosAppCredentials.createIosAppCredentials));
}
