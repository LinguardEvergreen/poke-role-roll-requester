const MODULE_ID = "poke-role-roll-requester";

/* ---------------------------------------- */
/*  Traits per Actor Type                   */
/* ---------------------------------------- */

const TRAITS = {
  trainer: {
    physicalMental: ["strength", "dexterity", "vitality", "insight"],
    social: ["tough", "cool", "beauty", "cute", "clever"],
    skills: [
      "brawl", "throw", "weapon", "evasion",
      "alert", "athletic", "nature", "stealth",
      "empathy", "etiquette", "intimidate", "perform",
      "crafts", "lore", "medicine", "science"
    ]
  },
  pokemon: {
    physicalMental: ["strength", "dexterity", "vitality", "special", "insight"],
    social: ["tough", "beauty", "cool", "cute", "clever"],
    skills: [
      "brawl", "channel", "clash", "evasion",
      "alert", "athletic", "nature", "stealth",
      "charm", "etiquette", "intimidate", "perform"
    ]
  }
};

function getTraitsForActor(actor) {
  const type = actor.type; // "trainer" or "pokemon"
  return TRAITS[type] || TRAITS.pokemon;
}

function loc(key, data = {}) {
  return game.i18n.format(key, data);
}

// Safe renderTemplate that works in v13+
function safeRenderTemplate(path, data) {
  if (foundry.applications?.handlebars?.renderTemplate) {
    return foundry.applications.handlebars.renderTemplate(path, data);
  }
  return renderTemplate(path, data);
}

console.log(`${MODULE_ID} | Module script loaded`);

/* ---------------------------------------- */
/*  Token HUD Button                        */
/* ---------------------------------------- */

Hooks.on("renderTokenHUD", (app, html, context, options) => {
  if (!game.user.isGM) return;

  const token = app.object;
  if (!token?.actor) return;

  if (html.querySelector('[data-action="request-roll"]')) return;

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

  const traits = getTraitsForActor(actor);

  const templateData = {
    physicalMental: traits.physicalMental.map(key => ({
      key,
      label: loc(`ROLL_REQ.${key}`),
      value: actor.system.attributes?.[key] ?? 0
    })),
    social: traits.social.map(key => ({
      key,
      label: loc(`ROLL_REQ.${key}`),
      value: actor.system.attributes?.[key] ?? 0
    })),
    skills: traits.skills.map(key => ({
      key,
      label: loc(`ROLL_REQ.${key}`),
      value: actor.system.skills?.[key] ?? 0
    })),
    actionNumber: actor.system.combat?.actionNumber ?? 1
  };

  const content = await safeRenderTemplate(`modules/${MODULE_ID}/templates/request-dialog.hbs`, templateData);

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
          return processRequestForm(button.form, actor);
        }
      },
      {
        action: "cancel",
        label: loc("ROLL_REQ.cancel"),
        icon: "fas fa-times"
      }
    ]
  });

  Hooks.once("renderDialogV2", (app, html) => {
    if (app !== dialog) return;
    attachSelectionConstraints(html);
  });

  dialog.render(true);
}

/* ---------------------------------------- */
/*  Selection Constraints                   */
/* ---------------------------------------- */

function attachSelectionConstraints(html) {
  html.querySelectorAll(".roll-req-selectable").forEach(cb => {
    cb.addEventListener("change", () => updateConstraints(html));
  });
}

function updateConstraints(html) {
  const allCheckboxes = Array.from(html.querySelectorAll(".roll-req-selectable"));
  const checked = allCheckboxes.filter(cb => cb.checked);
  const checkedCount = checked.length;
  const hasPhysical = checked.some(cb => cb.dataset.group === "physical");
  const hasSocial = checked.some(cb => cb.dataset.group === "social");

  allCheckboxes.forEach(cb => {
    const group = cb.dataset.group;
    if (cb.checked) {
      cb.disabled = false;
      cb.closest(".roll-req-trait")?.classList.remove("roll-req-disabled");
      return;
    }
    let shouldDisable = false;
    if (checkedCount >= 2) shouldDisable = true;
    if (group === "physical" && hasSocial) shouldDisable = true;
    if (group === "social" && hasPhysical) shouldDisable = true;
    cb.disabled = shouldDisable;
    cb.closest(".roll-req-trait")?.classList.toggle("roll-req-disabled", shouldDisable);
  });
}

function processRequestForm(form, actor) {
  const traits = getTraitsForActor(actor);
  const selectedTraits = [];
  const traitLabels = [];

  for (const key of [...traits.physicalMental, ...traits.social]) {
    if (form.elements[`attr-${key}`]?.checked) {
      selectedTraits.push({ type: "attribute", key });
      traitLabels.push(loc(`ROLL_REQ.${key}`));
    }
  }
  for (const key of traits.skills) {
    if (form.elements[`skill-${key}`]?.checked) {
      selectedTraits.push({ type: "skill", key });
      traitLabels.push(loc(`ROLL_REQ.${key}`));
    }
  }

  if (selectedTraits.length === 0) throw new Error(loc("ROLL_REQ.noTraitSelected"));
  if (selectedTraits.length > 2) throw new Error(loc("ROLL_REQ.maxTwoTraits"));

  const message = form.elements["gm-message"]?.value || "";
  const requiredSuccesses = parseInt(form.elements["required-successes"]?.value) || 1;
  const applyPainPenalty = form.elements["apply-pain"]?.checked ?? true;

  sendRollRequest(actor, selectedTraits, traitLabels, message, requiredSuccesses, applyPainPenalty);
}

/* ---------------------------------------- */
/*  Send Roll Request to Chat               */
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

  const content = await safeRenderTemplate(`modules/${MODULE_ID}/templates/chat/roll-request.hbs`, templateData);

  // Whisper to actor owners + all GMs
  const ownerIds = Object.entries(actor.ownership)
    .filter(([id, level]) => level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && id !== "default")
    .map(([id]) => id);

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
/*  Socket: GM updates message flags        */
/* ---------------------------------------- */

const SOCKET_NAME = `module.${MODULE_ID}`;

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready hook fired, registering socket listener`);

  game.socket.on(SOCKET_NAME, async (data) => {
    const firstGM = game.users.find(u => u.isGM && u.active);
    if (game.user.id !== firstGM?.id) return;

    if (data.action === "updateRollResult") {
      console.log(`${MODULE_ID} | GM received roll result via socket for message`, data.messageId);
      const message = game.messages.get(data.messageId);
      if (!message) return;

      await message.update({
        [`flags.${MODULE_ID}.rolled`]: true,
        [`flags.${MODULE_ID}.rollResult`]: data.rollResult
      });
    }
  });
});

/* ---------------------------------------- */
/*  Chat Render: ALWAYS attach listener     */
/* ---------------------------------------- */

Hooks.on("renderChatMessageHTML", (message, html) => {
  const button = html.querySelector(".roll-req-execute");
  if (!button) return;

  console.log(`${MODULE_ID} | renderChatMessageHTML: found button, user=${game.user.name}, isGM=${game.user.isGM}`);

  // If already rolled, show result inline and remove button
  const rollResult = message.getFlag(MODULE_ID, "rollResult");
  if (rollResult) {
    console.log(`${MODULE_ID} | Already rolled, showing result`);
    const resultEl = buildResultElement(rollResult);
    button.replaceWith(resultEl);
    return;
  }

  // ALWAYS attach click listener — permission check happens at click time
  console.log(`${MODULE_ID} | Attaching click listener to button`);
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) return;

    console.log(`${MODULE_ID} | Button clicked!`);

    // Parse request data from the button
    let requestData;
    try {
      requestData = JSON.parse(button.dataset.request);
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to parse request data:`, err);
      return;
    }

    const actor = game.actors.get(requestData.actorId);
    if (!actor) {
      console.warn(`${MODULE_ID} | Actor not found:`, requestData.actorId);
      ui.notifications.warn("Actor not found.");
      return;
    }

    button.disabled = true;
    button.classList.add("rolled");

    try {
      await executeRoll(actor, requestData, message);
    } catch (err) {
      console.error(`${MODULE_ID} | Roll failed:`, err);
      ui.notifications.error("Roll failed. Check console for details.");
      button.disabled = false;
      button.classList.remove("rolled");
    }
  });
});

/* ---------------------------------------- */
/*  Build Result Element                    */
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

  let dicePool = 0;
  const breakdownParts = [];

  for (const trait of traits) {
    let value = 0;
    if (trait.type === "attribute") {
      value = actor.system.attributes?.[trait.key] ?? 0;
    } else if (trait.type === "skill") {
      value = actor.system.skills?.[trait.key] ?? 0;
    }
    breakdownParts.push(`${loc(`ROLL_REQ.${trait.key}`)}: ${value}`);
    dicePool += value;
  }

  let removedSuccesses = 0;
  if (applyPainPenalty) {
    const hp = actor.system.resources?.hp;
    if (hp) {
      const halfMax = Math.floor(hp.max / 2);
      if (hp.value <= 1) removedSuccesses = 2;
      else if (hp.value <= halfMax) removedSuccesses = 1;
    }
  }

  dicePool = Math.max(dicePool, 1);

  console.log(`${MODULE_ID} | Rolling ${dicePool}d6cs>=4`);
  const roll = await new Roll(`${dicePool}d6cs>=4`).evaluate();

  const rawSuccesses = roll.total;
  const netSuccesses = Math.max(rawSuccesses - removedSuccesses, 0);
  const success = netSuccesses >= requiredSuccesses;
  const diceValues = roll.dice[0].results.map(r => r.result);

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

  console.log(`${MODULE_ID} | Roll result:`, rollResult);

  if (game.user.isGM) {
    await requestMessage.update({
      [`flags.${MODULE_ID}.rolled`]: true,
      [`flags.${MODULE_ID}.rollResult`]: rollResult
    });
  } else {
    console.log(`${MODULE_ID} | Sending result to GM via socket`);
    game.socket.emit(SOCKET_NAME, {
      action: "updateRollResult",
      messageId: requestMessage.id,
      rollResult
    });
  }
}
