stack : react, vite, tailwindcss

besoin : faire un site qui ressemble a chatgpt (chatbot conversationnel), mais qui est a vocation pedagogique.

- le site doit avoir une layout header, footer, et body qui prend l'espace restant.
- le site doit avoir une primary side bar qui permet de configurer des elements
- le site doit avoir une secondary side bar sur la droite qui permet de visualiser les requetes et responses HTTP qui transitent entre le client et le serveur du LLM.
- configuration : stockabe en localstorage.
  - Provider du LLM -> openai, ovh, LM Studio, Ollama.
  - si necessaire pour le provider du LLM, fournir une cle d'authentification pour l'API
  - mode stream : on/off
  - utilisation de tool calling via MCP server. Dans ce cas, l'utilisateur peut saisir l'URL du serveur MCP. Activation/Desactivation de skill
  - configuration d'un prompt system
  - configuration d'un json schema pour structured output.
- configuration de skills : chargement d'un zip contenant le skill (crud de skill ensuite), activation/desactivation de skill
- le site doit pouvoir faire des discussions
