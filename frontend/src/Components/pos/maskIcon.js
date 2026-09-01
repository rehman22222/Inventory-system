import React from "react";

// Turns a piece of the shop's own artwork into an icon the till can colour.
//
// The art arrives as white shapes on transparency. Painted in as an <img> that
// is white wherever it lands — glaring on a dim tile, invisible on a bright
// one, and needing a second copy of the file for every colour it has to be.
// Drawn as a CSS mask, only the SHAPE is used and the paint comes from
// `currentColor`, so a single file follows whatever the thing around it is
// already doing.
//
// The caller sizes it through className, the same as any react-icons glyph, so
// these drop in wherever one of those was.
export const maskIcon = (src, name) => {
  const Icon = ({ className = "" }) => (
    <span
      role="presentation"
      className={className}
      style={{
        display: "inline-block",
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );

  Icon.displayName = `MaskIcon(${name})`;
  return Icon;
};

export default maskIcon;
