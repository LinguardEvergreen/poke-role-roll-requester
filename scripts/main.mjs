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
    actorId: actor.id,
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
/*  Socket Handling + Delegated Listeners   */
/* ---------------------------------------- */

const SOCKET_NAME = `module.${MODULE_ID}`;

Hooks.once("ready", () => {
  // Socket: GM receives roll results from players
  game.socket.on(SOCKET_NAME, async (data) => {
    const firstGM = game.users.find(u => u.isGM && u.active);
    if (game.user.id !== firstGM?.id) return;

    if (data.action === "updateRollResult") {
      const message = game.messages.get(data.messageId);
      if (!message) return;

      await message.update({
        [`flags.${MODULE_ID}.rolled`]: true,
        [`flags.${MODULE_ID}.rollResult`]: data.rollResult
      });
    }
  });

  // Delegated click listener on the chat log — survives DOM replacement
  const chatLog = document.getElementById("chat-log");
  if (chatLog) chatLog.addEventListener("click", handleRollButtonClick);
});

/* ---------------------------------------- */
/*  Render Hook - Display results / hide    */
/* ---------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  const button = html.querySelector(".roll-req-execute");
  if (!button) return;

  const actorId = button.dataset.actorId;
  const actor = game.actors.get(actorId);

  // Hide button from non-owners
  if (!actor?.isOwner) {
    button.style.display = "none";
    return;
  }

  // If already rolled, replace button with stored result
  const rollResult = message.getFlag(MODULE_ID, "rollResult");
  if (rollResult) {
    const resultEl = buildResultElement(rollResult);
    button.replaceWith(resultEl);
    return;
  }
});

/* ---------------------------------------- */
/*  Handle Roll Button Click (delegated)    */
/* ---------------------------------------- */

async function handleRollButtonClick(event) {
  const button = event.target.closest(".roll-req-execute");
  if (!button || button.disabled) return;

  // Find the parent chat message element and get the message document
  const messageEl = button.closest("[data-message-id]");
  if (!messageEl) return;
  const message = game.messages.get(messageEl.dataset.messageId);
  if (!message) return;

  // Already rolled?
  if (message.getFlag(MODULE_ID, "rolled")) return;

  const actorId = button.dataset.actorId;
  const actor = game.actors.get(actorId);
  if (!actor?.isOwner) return;

  // Disable button immediately
  event.preventDefault();
  button.disabled = true;
  button.classList.add("rolled");

  try {
    const requestData = JSON.parse(button.dataset.request);
    await executeRoll(actor, requestData, message);
  } catch (err) {
    console.error(`${MODULE_ID} | Roll execution failed:`, err);
    ui.notifications.error("Roll failed. Check console for details.");
    button.disabled = false;
    button.classList.remove("rolled");
  }
}

/* ---------------------------------------- */
/*  Build Result Element from stored data   */
/* ---------------------------------------- */

function buildResultElement(result) {
  const {
    diceValues, breakdown, dicePool,
    rawSuccesses, removedSuccesses, netSuccesses,
    requiredSuccesses, success, traitString
  } = result;

  const diceHtml = diceValues.map(v => {
    const cls = v >= 4 ? "roll-req-die-success" : "roll-req-die-fail";
    return `<span class="roll-req-die ${cls}">${v}</span>`;
  }).join("");

  const container = document.createElement("div");
  container.classList.add("roll-req-result-block");
  container.innerHTML = `
    <div class="roll-req-roll-label">${loc("ROLL_REQ.rollButton", { traits: traitString })}</div>
    <div class="roll-req-dice-row">${diceHtml}</div>
    <div class="roll-req-stats">
      <span>${breakdown} = ${dicePool}d6</span>
    </div>
    <div class="roll-req-summary">
      Raw: ${rawSuccesses} | Removed: ${removedSuccesses} | Net: ${netSuccesses} | Required: ${requiredSuccesses}
    </div>
    <div class="roll-req-result-badge ${success ? "roll-req-success" : "roll-req-fail"}">
      ${success ? "HIT" : "MISS"}
    </div>`;

  return container;
}

/* ---------------------------------------- */
/*  Execute the Roll                        */
/* ---------------------------------------- */

async function executeRoll(actor, requestData, requestMessage) {
  const { traits, traitLabels, requiredSuccesses, applyPainPenalty } = requestData;

  // Calculate dice pool
  let dicePool = 0;
  const breakdownParts = [];

  for (const trait of traits) {
    let value = 0;
    if (trait.type === "attribute") {
      value = actor.system.attributes?.[trait.key] ?? 0;
    } else if (trait.type === "skill") {
      value = actor.system.skills?.[trait.key] ?? 0;
    }
    const label = loc(`ROLL_REQ.${trait.key}`);
    breakdownParts.push(`${label}: ${value}`);
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

  // Roll the dice
  const roll = await new Roll(`${dicePool}d6cs>=4`).evaluate();

  const rawSuccesses = roll.total;
  const netSuccesses = Math.max(rawSuccesses - removedSuccesses, 0);
  const success = netSuccesses >= requiredSuccesses;
  const diceValues = roll.dice[0].results.map(r => r.result);

  // Serializable result object to store in message flags
  const rollResult = {
    diceValues,
    breakdown: breakdownParts.join(" | "),
    dicePool,
    rawSuccesses,
    removedSuccesses,
    netSuccesses,
    requiredSuccesses,
    success,
    traitString: traitLabels.join(" + ")
  };

  // Store result via flags — GM updates directly, player uses socket
  if (game.user.isGM) {
    await requestMessage.update({
      [`flags.${MODULE_ID}.rolled`]: true,
      [`flags.${MODULE_ID}.rollResult`]: rollResult
    });
  } else {
    game.socket.emit(SOCKET_NAME, {
      action: "updateRollResult",
      messageId: requestMessage.id,
      rollResult
    });
  }
}
