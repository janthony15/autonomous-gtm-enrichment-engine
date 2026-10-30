#!/usr/bin/env node
/**
 * Apollo Search CLI & MCP Runner
 * Author: Brent Maurice
 * Direct CLI runner for Apollo.io searches and MCP pipeline execution.
 */

import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

// Load environment from potential locations
const envPaths = [
  path.resolve("C:/Users/bmaur/.claude/mcp-servers/apollo-leads/.env"),
  path.resolve("C:/Users/bmaur/autonomous-gtm-enrichment-engine/.env"),
  path.resolve(".env")
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    const lines = fs.readFileSync(p, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || "";
        val = val.trim().replace(/^['"]|['"]$/g, "");
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

// Parse args
const args = process.argv.slice(2);
function getArg(flag, alias) {
  const idx = args.findIndex(a => a === flag || (alias && a === alias));
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}
const hasFlag = (flag, alias) => args.some(a => a === flag || (alias && a === alias));

const title = getArg("--title", "-t");
const company = getArg("--company", "-c") || getArg("--keywords", "-k");
const location = getArg("--location", "-l");
const industry = getArg("--industry", "-i");
const limit = parseInt(getArg("--limit") || "5", 10);
const apiKey = getArg("--api-key") || process.env.APOLLO_API_KEY;
const isDemo = hasFlag("--demo");
const isCompanySearch = hasFlag("--companies");

if (apiKey) {
  process.env.APOLLO_API_KEY = apiKey;
}

console.log("\n=======================================================");
console.log("🚀 Apollo.io Search & GTM Enrichment Engine (Direct CLI)");
console.log("=======================================================\n");

async function run() {
  if (isDemo) {
    console.log("⚡ RUNNING LIVE DEMO MODE (Schema-Accurate Simulation)\n");
    console.log(`Query: Title="${title || 'Chief Product Officer'}" | Company="${company || 'Apollo.io'}" | Location="${location || 'Remote'}"\n`);
    await new Promise(r => setTimeout(r, 600));

    const demoResults = [
      {
        name: "Mark Sieglock",
        title: "Chief Product Officer",
        company: "Apollo.io",
        email: "mark.sieglock@apollo.io",
        email_status: "verified",
        location: "San Francisco, CA, United States",
        linkedin_url: "https://www.linkedin.com/in/sieglock/",
        company_size: "1,000-5,000",
        industry: "Computer Software / SaaS"
      },
      {
        name: "Eric Quanstrom",
        title: "VP of GTM Engineering & Solutions",
        company: "Apollo.io",
        email: "eric.quanstrom@apollo.io",
        email_status: "verified",
        location: "United States (Remote)",
        linkedin_url: "https://www.linkedin.com/in/ericquanstrom/",
        company_size: "1,000-5,000",
        industry: "Computer Software / SaaS"
      }
    ];

    console.log(`✅ Returned ${demoResults.length} Enriched Records via Apollo v1 Engine:\n`);
    demoResults.forEach((p, idx) => {
      console.log(`[#${idx + 1}] ${p.name.toUpperCase()} — ${p.title}`);
      console.log(`     Organization: ${p.company} (${p.company_size} emp | ${p.industry})`);
      console.log(`     Email:        ${p.email} [${p.email_status}]`);
      console.log(`     Location:     ${p.location}`);
      console.log(`     LinkedIn:     ${p.linkedin_url}`);
      console.log("-------------------------------------------------------");
    });
    console.log("\n✨ Pipeline Complete: Ready for MX Verification & Viability Scoring.");
    return;
  }

  if (!process.env.APOLLO_API_KEY) {
    console.error("❌ APOLLO_API_KEY is not configured.");
    console.log("\nTo execute live searches on your latest Apollo account:");
    console.log("1. Pass key via argument:  node apollo_search.js --api-key <YOUR_KEY> --title \"...\"");
    console.log("2. Or set environment var:  $env:APOLLO_API_KEY=\"<YOUR_KEY>\"");
    console.log("3. Or run demo mode:       node apollo_search.js --demo --title \"VP Sales\"\n");
    console.log("Get your active API key at: https://app.apollo.io/#/settings/integrations/api_keys\n");
    process.exit(1);
  }

  try {
    const apolloApi = await import("C:/Users/bmaur/.claude/mcp-servers/apollo-leads/lib/apollo-api.js");

    if (isCompanySearch) {
      console.log(`🔍 Querying Apollo Companies: Keywords="${company || ''}" Location="${location || ''}" Industry="${industry || ''}"...`);
      const companies = await apolloApi.searchCompanies({
        keywords: company,
        location,
        industry,
        limit
      });

      console.log(`\n✅ Found ${companies.length} target companies in Apollo:\n`);
      companies.forEach((c, idx) => {
        console.log(`[#${idx + 1}] ${c.name} (${c.website_url || 'No Website'})`);
        console.log(`     Industry:    ${c.industry || 'N/A'}`);
        console.log(`     Employees:   ${c.estimated_num_employees || 'N/A'}`);
        console.log(`     Location:    ${[c.city, c.state, c.country].filter(Boolean).join(', ')}`);
        console.log(`     Description: ${(c.short_description || '').slice(0, 100)}...`);
        console.log("-------------------------------------------------------");
      });
    } else {
      console.log(`🔍 Querying Apollo People: Title="${title || ''}" Company="${company || ''}" Location="${location || ''}"...`);
      const people = await apolloApi.searchPeople({
        title,
        location,
        industry,
        company_keywords: company,
        limit
      });

      if (!people || people.length === 0) {
        console.log("⚠️ No decision-makers found matching criteria.");
        return;
      }

      console.log(`Enriching top ${Math.min(people.length, 5)} profiles with verified email/phone...`);
      const enriched = await apolloApi.enrichPeople(people.slice(0, 5));

      console.log(`\n✅ Retrieved & Enriched ${enriched.length} Decision-Makers:\n`);
      enriched.forEach((p, idx) => {
        console.log(`[#${idx + 1}] ${p.name} — ${p.title}`);
        console.log(`     Company:   ${p.company}`);
        console.log(`     Email:     ${p.email || 'Revealed on Outbound Queue'}`);
        console.log(`     Location:  ${p.location || 'N/A'}`);
        console.log(`     LinkedIn:  ${p.linkedin_url || 'N/A'}`);
        console.log("-------------------------------------------------------");
      });
    }
  } catch (err) {
    console.error(`❌ Apollo Query Error: ${err.message}`);
    process.exit(1);
  }
}

run();
