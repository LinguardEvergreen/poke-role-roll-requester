const MODULE_ID = "poke-role-roll-requester";

const PHYSICAL_MENTAL = ["strength", "dexterity", "vitality", "special", "insight"];
const SOCIAL = ["tough", "beauty", "cool", "cute", "clever", "allure"];
const SKILLS = [
  "alert", "athletic", "brawl", "channel", "clash", "crafts",
  "empathy", "etiquette", "evasion", "intimidate", "lore", "medicine",
  "nature", "perform", "science", "stealth", "throw", "weapons"
];

function loc(key, data = {}) {
  return game.i18n.format(key, data);
}

/* ---------------------------------------- */
/*  Token HUD Button                        */
/* ---------------------------------------- */

Hooks.on("renderTokenHUD", (app, html, context, options) => {
  if (!game.user.isGM) return;

  const token = app.object;
  if (!token?.actor) return;

  // Prevent duplicate buttons on re-render
  if (html.querySelector('[data-action="request-roll"]')) return;

  // Create the button
  const button = document.createElement("div");
  button.classList.add("control-icon");
  button.dataset.action = "request-roll";
  button.innerHTML = `<i class="fas fa-dice-d20"></i>`;
  button.dataset.tooltip = loc("ROLL_REQ.contextMenu");

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openRequestDialog(token);
  });

  // Insert after the combat toggle button in the right column
  const rightCol = html.querySelector(".col.right");
  if (rightCol) {
    const combatButton = rightCol.querySelector('[data-action="combat"]');
    if (combatButton) {
      combatButton.after(button);
    } else {
      rightCol.prepend(button);
    }
  }
});

/* ---------------------------------------- */
/*  Request Dialog                          */
/* ---------------------------------------- */

async function openRequestDialog(token) {
  const actor = token.actor;
  if (!actor) return;

  const templateData = {
    physicalMental: PHYSICAL_MENTAL.map(key => ({
      key,
      label: loc(`ROLL_REQ.${key}`),
      value: actor.system.attributes?.[key] ?? 0
    })),
    social: SOCIAL.map(key => ({
      key,
      label: loc(`ROLL_REQ.${key}`),
      value: actor.system.attributes?.[key] ?? 0
    })),
    skills: SKILLS.map(key => ({
      key,
      label: loc(`ROLL_REQ.${key}`),
      value: actor.system.skills?.[key] ?? 0
    })),
    actionNumber: actor.system.combat?.actionNumber ?? 1
  };

  const content = await renderTemplate(`modules/${MODULE_ID}/templates/request-dialog.hbs`, templateData);

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: loc("ROLL_REQ.dialogTitle", { name: actor.name }) },
    content,
    buttons: [
      {
        action: "send",
        label: loc("ROLL_REQ.send"),
        icon: "fas fa-paper-plane",
        default: true,
        callback: (event, button, dlg) => {
          const form = button.form;
          return processRequestForm(form, actor);
        }
      },
      {
        action: "cancel",
        label: loc("ROLL_REQ.cancel"),
        icon: "fas fa-times"
      }
    ]
  });

  // Hook into dialog render to attach selection constraint logic
  Hooks.once("renderDialogV2", (app, html) => {
    if (app !== dialog) return;
    attachSelectionConstraints(html);
  });

  dialog.render(true);
}

/**
 * Attach checkbox selection constraints to the dialog:
 * - Max 2 total selections
 * - Physical/Mental and Social attributes are mutually exclusive
 */
function attachSelectionConstraints(html) {
  const allCheckboxes = html.querySelectorAll(".roll-req-selectable");

  allCheckboxes.forEach(cb => {
    cb.addEventListener("change", () => updateConstraints(html));
  });
}

function updateConstraints(html) {
  const allCheckboxes = Array.from(html.querySelectorAll(".roll-req-selectable"));
  const checked = allCheckboxes.filter(cb => cb.checked);
  const checkedCount = checked.length;

  // Determine which attribute group is active (physical or social)
  const hasPhysical = checked.some(cb => cb.dataset.group === "physical");
  const hasSocial = checked.some(cb => cb.dataset.group === "social");

  allCheckboxes.forEach(cb => {
    const group = cb.dataset.group;

    // If already checked, always keep enabled so user can uncheck
    if (cb.checked) {
      cb.disabled = false;
      cb.closest(".roll-req-trait")?.classList.remove("roll-req-disabled");
      return;
    }

    let shouldDisable = false;

    // Rule 1: Max 2 selections total
    if (checkedCount >= 2) {
      shouldDisable = true;
    }

    // Rule 2: Physical/Mental and Social are mutually exclusive
    if (group === "physical" && hasSocial) {
      shouldDisable = true;
    }
    if (group === "social" && hasPhysical) {
      shouldDisable = true;
    }

    cb.disabled = shouldDisable;
    cb.closest(".roll-req-trait")?.classList.toggle("roll-req-disabled", shouldDisable);
  });
}

function processRequestForm(form, actor) {
  const selectedTraits = [];
  const traitLabels = [];

  for (const key of [...PHYSICAL_MENTAL, ...SOCIAL]) {
    const checkbox = form.elements[`attr-${key}`];
    if (checkbox?.checked) {
      selectedTraits.push({ type: "attribute", key });
      traitLabels.push(loc(`ROLL_REQ.${key}`));
    }
  }
  for (const key of SKILLS) {
    const checkbox = form.elements[`skill-${key}`];
    if (checkbox?.checked) {
      selectedTraits.push({ type: "skill", key });
      traitLabels.push(loc(`ROLL_REQ.${key}`));
    }
  }

  if (selectedTraits.length === 0) {
    throw new Error(loc("ROLL_REQ.noTraitSelected"));
  }
  if (selectedTraits.length > 2) {
    throw new Error(loc("ROLL_REQ.maxTwoTraits"));
  }

  const message = form.elements["gm-message"]?.value || "";
  const requiredSuccesses = parseInt(form.elements["required-successes"]?.value) || 1;
  const applyPainPenalty = form.elements["apply-pain"]?.checked ?? true;

  sendRollRequest(actor, selectedTraits, traitLabels, message, requiredSuccesses, applyPainPenalty);
}

/* ---------------------------------------- */
/*  Chat Message - Request                  */
/* ---------------------------------------- */

async function sendRollRequest(actor, selectedTraits, traitLabels, gmMessage, requiredSuccesses, applyPainPenalty) {
  const buttonLabel = loc("ROLL_REQ.rollButton", { traits: traitLabels.join(" + ") });

  const requestData = {
    actorId: actor.id,
    traits: selectedTraits,
    traitLabels,
    requiredSuccesses,
    applyPainPenalty
  };

  const templateData = {
    gmMessage,
    buttonLabel,
    requestData: JSON.stringify(requestData),
    actorName: actor.name,
    title: loc("ROLL_REQ.chatRequestTitle")
  };

  const content = await renderTemplate(`modules/${MODULE_ID}/templates/chat/roll-request.hbs`, templateData);

  // Find the player who owns this actor
  const ownerIds = Object.entries(actor.ownership)
    .filter(([id, level]) => level === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && id !== "default")
    .map(([id]) => id);

  // Whisper to owners and GM
  const whisperTargets = [...new Set([...ownerIds, ...game.users.filter(u => u.isGM).map(u => u.id)])];

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ alias: "Game Master" }),
    whisper: whisperTargets,
    flags: {
      [MODULE_ID]: { isRollRequest: true, requestData }
    }
  });
}

/* ---------------------------------------- */
/*  Chat Message - Roll Button Listener     */
/* ---------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  const button = html.querySelector(".roll-req-execute");
  if (!button) return;

  const requestData = JSON.parse(button.dataset.request);
  const actor = game.actors.get(requestData.actorId);

  // Only show button to the actor's owner (non-GM) or GM
  if (!actor?.isOwner) {
    button.style.display = "none";
    return;
  }

  // If already rolled, keep button disabled
  if (message.getFlag(MODULE_ID, "rolled")) {
    button.disabled = true;
    button.classList.add("rolled");
    return;
  }

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    button.disabled = true;
    button.classList.add("rolled");

    await executeRoll(actor, requestData, message);
  });
});

/* ---------------------------------------- */
/*  Execute the Roll                        */
/* ---------------------------------------- */

async function executeRoll(actor, requestData, requestMessage) {
  const { traits, traitLabels, requiredSuccesses, applyPainPenalty } = requestData;

  // Calculate dice pool
  let dicePool = 0;
  const breakdown = [];

  for (const trait of traits) {
    let value = 0;
    if (trait.type === "attribute") {
      value = actor.system.attributes?.[trait.key] ?? 0;
    } else if (trait.type === "skill") {
      value = actor.system.skills?.[trait.key] ?? 0;
    }
    const label = loc(`ROLL_REQ.${trait.key}`);
    breakdown.push(`${label}: ${value}`);
    dicePool += value;
  }

  // Pain penalty
  let removedSuccesses = 0;
  if (applyPainPenalty) {
    const hp = actor.system.resources?.hp;
    if (hp) {
      const halfMax = Math.floor(hp.max / 2);
      if (hp.value <= 1) removedSuccesses = 2;
      else if (hp.value <= halfMax) removedSuccesses = 1;
    }
  }

  // Minimum 1 die
  dicePool = Math.max(dicePool, 1);

  // Roll
  const roll = await new Roll(`${dicePool}d6cs>=4`).evaluate();

  const rawSuccesses = roll.total;
  const netSuccesses = Math.max(rawSuccesses - removedSuccesses, 0);
  const success = netSuccesses >= requiredSuccesses;

  // Build flavor
  const traitString = traitLabels.join(" + ");
  const flavor = `<strong>${loc("ROLL_REQ.rollButton", { traits: traitString })}</strong>
    <br><small>${breakdown.join(" | ")} = ${dicePool}d6</small>
    <br>Raw: ${rawSuccesses} | Removed: ${removedSuccesses} | Net: ${netSuccesses} | Required: ${requiredSuccesses}
    <span class="roll-req-result ${success ? "roll-req-success" : "roll-req-fail"}">${success ? "HIT" : "MISS"}</span>`;

  // Post roll to chat
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor
  });

  // Mark request as rolled
  await requestMessage.setFlag(MODULE_ID, "rolled", true);
}
