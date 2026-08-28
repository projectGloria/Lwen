# Model brand artwork

Lwen draws its own family marks for Ollama, Qwen, Llama, Mistral and the rest
(see `src/components/ModelIcons.jsx`). They are Lwen's own drawings in each
family's colour, not the vendors' trademarked logo files.

To show the real logos instead, drop an SVG in this folder named after the
family key and it is used automatically — no rebuild of the icon code needed:

    ollama.svg  qwen.svg   llama.svg    mistral.svg  gemma.svg
    deepseek.svg  phi.svg  granite.svg  command-r.svg
    starcoder.svg  glm.svg  yi.svg      smollm.svg   embed.svg

Square viewBox, and pick a version that reads on a dark background. Anything
missing quietly falls back to the drawn mark. Check each vendor's brand terms
before shipping their artwork in a build you distribute.
