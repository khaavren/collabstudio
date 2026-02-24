#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "bandjoes-assets";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Export both before running seed:demo."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const seedRooms = [
  {
    name: "Band Joes Studio - Hardware Concepts",
    assets: [
      {
        title: "Band Joes Hard Hat Tri-Mount\u2122",
        prompts: [
          "Industrial hard-hat accessory concept with three-point camera mount and matte black finish",
          "Refined Tri-Mount hard-hat clip with yellow safety accents and exploded component view"
        ]
      },
      {
        title: "Band Joes Connect\u2122 Cross Adapter Clip",
        prompts: [
          "Universal cross adapter clip concept for modular bands, steel and elastomer blend",
          "Adapter clip close-up showing locking teeth and ergonomic pinch tabs"
        ]
      },
      {
        title: "Band Joes Grid System\u2122 Starter Kit",
        prompts: [
          "Grid starter kit with interchangeable connectors on workbench, catalog style",
          "Starter kit packaging concept with labeled compartments and durable carry case"
        ]
      }
    ]
  },
  {
    name: "Band Joes Studio - Service Concepts",
    assets: [
      {
        title: "Band Joes ShipCross\u2122 Coffee Subscription",
        prompts: [
          "Coffee subscription brand concept card set with cross-shipping package inserts",
          "Subscription dashboard hero image for ShipCross coffee logistics concept"
        ]
      }
    ]
  }
];

function placeholderUrl(prompt, size = "1024x1024") {
  const [width, height] = size.split("x");
  const seed = createHash("sha256")
    .update(`${prompt}:${size}:band-joes-studio:seed-script`)
    .digest("hex")
    .slice(0, 16);

  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

async function ensureBucket() {
  const { data: existing, error } = await supabase.storage.getBucket(BUCKET);
  if (!error && existing) return;

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: true
  });

  if (createError && !createError.message.toLowerCase().includes("already")) {
    throw new Error(`Unable to create bucket ${BUCKET}: ${createError.message}`);
  }
}

async function getOrCreateOrganization() {
  const slug = "band-joes-studio";

  const { data: existing, error: findError } = await supabase
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (findError) {
    throw new Error(`Organization query failed: ${findError.message}`);
  }

  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("organizations")
    .insert({
      name: "Band Joes Studio",
      slug,
      contact_email: "studio@bandjoes.com"
    })
    .select("*")
    .single();

  if (createError || !created) {
    throw new Error(`Organization insert failed: ${createError?.message ?? "unknown"}`);
  }

  return created;
}

async function syncAdminMembers(organizationId) {
  const rawAdminEmails = process.env.ADMIN_EMAILS ?? "";
  const adminEmails = rawAdminEmails
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) return;

  const { data: usersPage, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (usersError) {
    throw new Error(`Could not list users for admin sync: ${usersError.message}`);
  }

  for (const email of adminEmails) {
    const user = usersPage.users.find((entry) => entry.email?.toLowerCase() === email);
    if (!user?.id) {
      console.warn(`Admin email ${email} not found in auth users yet.`);
      continue;
    }

    const { error } = await supabase.from("team_members").upsert(
      {
        organization_id: organizationId,
        user_id: user.id,
        role: "admin"
      },
      {
        onConflict: "organization_id,user_id"
      }
    );

    if (error) {
      throw new Error(`Failed to add admin member ${email}: ${error.message}`);
    }
  }
}

async function getOrCreateRoom(organizationId, name) {
  const { data: existing, error: findError } = await supabase
    .from("rooms")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("name", name)
    .limit(1)
    .maybeSingle();

  if (findError) throw new Error(`Room query failed for ${name}: ${findError.message}`);
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("rooms")
    .insert({ organization_id: organizationId, name })
    .select("*")
    .single();

  if (createError || !created) {
    throw new Error(`Room insert failed for ${name}: ${createError?.message ?? "unknown error"}`);
  }

  return created;
}

async function getOrCreateAsset(organizationId, roomId, title) {
  const { data: existing, error: findError } = await supabase
    .from("assets")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("room_id", roomId)
    .eq("title", title)
    .limit(1)
    .maybeSingle();

  if (findError) throw new Error(`Asset query failed for ${title}: ${findError.message}`);
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("assets")
    .insert({
      organization_id: organizationId,
      room_id: roomId,
      title
    })
    .select("*")
    .single();

  if (createError || !created) {
    throw new Error(`Asset insert failed for ${title}: ${createError?.message ?? "unknown error"}`);
  }

  return created;
}

async function uploadSeedImage({ organizationId, assetId, prompt, version }) {
  const imageUrl = placeholderUrl(prompt);
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch placeholder image for ${assetId} v${version}`);
  }

  const buffer = await response.arrayBuffer();
  const path = `orgs/${organizationId}/seed/${assetId}/v${version}.jpg`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: "image/jpeg",
    upsert: true
  });

  if (error) {
    throw new Error(`Storage upload failed for ${assetId} v${version}: ${error.message}`);
  }

  return path;
}

async function ensureVersion({ organizationId, assetId, prompt, version }) {
  const { data: existing, error: findError } = await supabase
    .from("asset_versions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("asset_id", assetId)
    .eq("version", version)
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`Version query failed for ${assetId} v${version}: ${findError.message}`);
  }

  if (existing) return existing.storage_path;

  const storagePath = await uploadSeedImage({ organizationId, assetId, prompt, version });

  const { error: createError } = await supabase.from("asset_versions").insert({
    organization_id: organizationId,
    asset_id: assetId,
    version,
    prompt,
    params: { size: "1024x1024", style: "seeded-demo" },
    storage_path: storagePath
  });

  if (createError) {
    throw new Error(`Version insert failed for ${assetId} v${version}: ${createError.message}`);
  }

  return storagePath;
}

async function run() {
  await ensureBucket();
  const organization = await getOrCreateOrganization();
  await syncAdminMembers(organization.id);

  for (const roomEntry of seedRooms) {
    const room = await getOrCreateRoom(organization.id, roomEntry.name);
    console.log(`Room: ${room.name}`);

    for (const assetEntry of roomEntry.assets) {
      const asset = await getOrCreateAsset(organization.id, room.id, assetEntry.title);
      console.log(`  Asset: ${asset.title}`);

      let latestPath = asset.cover_storage_path;

      for (let i = 0; i < assetEntry.prompts.length; i += 1) {
        const version = i + 1;
        latestPath = await ensureVersion({
          organizationId: organization.id,
          assetId: asset.id,
          prompt: assetEntry.prompts[i],
          version
        });
      }

      if (latestPath) {
        const { error: updateError } = await supabase
          .from("assets")
          .update({ cover_storage_path: latestPath })
          .eq("id", asset.id)
          .eq("organization_id", organization.id);

        if (updateError) {
          throw new Error(`Failed updating cover path for ${asset.title}: ${updateError.message}`);
        }
      }
    }
  }

  console.log("Seed complete.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
