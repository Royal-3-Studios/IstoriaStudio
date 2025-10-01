// src/features/editor/canvas/konva/TransformerClient.tsx
"use client";

import * as React from "react";
import type Konva from "konva";
import { Transformer as RTransformer } from "react-konva";

type Props = React.ComponentProps<typeof RTransformer>;

/** Forwards the ref to the underlying Konva Transformer instance */
const TransformerClient = React.forwardRef<Konva.Transformer, Props>(
  function TransformerClient({ children, ...rest }, ref) {
    return (
      <RTransformer ref={ref} {...rest}>
        {children}
      </RTransformer>
    );
  }
);

export default TransformerClient;
