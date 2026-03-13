import { describe, it, expect } from "vitest";
import { pickHandleSides, getHandlePosition, type Box } from "@/utils/edgeRouting";

const box = (x: number, y: number): Box => ({ x, y, width: 200, height: 100 });

describe("pickHandleSides", () => {
  it("target directly right → source Right, target Left", () => {
    const result = pickHandleSides(box(0, 0), box(400, 0));
    expect(result).toEqual({ sourceSide: "right", targetSide: "left" });
  });

  it("target directly left → source Left, target Right", () => {
    const result = pickHandleSides(box(400, 0), box(0, 0));
    expect(result).toEqual({ sourceSide: "left", targetSide: "right" });
  });

  it("target directly below → source Bottom, target Top", () => {
    const result = pickHandleSides(box(0, 0), box(0, 300));
    expect(result).toEqual({ sourceSide: "bottom", targetSide: "top" });
  });

  it("target directly above → source Top, target Bottom", () => {
    const result = pickHandleSides(box(0, 300), box(0, 0));
    expect(result).toEqual({ sourceSide: "top", targetSide: "bottom" });
  });

  it("target upper-right (shallow) → source Right, target Left", () => {
    const result = pickHandleSides(box(0, 0), box(500, -100));
    expect(result).toEqual({ sourceSide: "right", targetSide: "left" });
  });

  it("target lower-right at exactly 45° → source Bottom, target Top", () => {
    // centers: (100,50) → (400,350), angle = atan2(300,300) = 45°
    const result = pickHandleSides(box(0, 0), box(200, 200));
    // At exactly equal dx=dy angle is 45°, which falls in bottom/top bucket
    expect(result).toEqual({ sourceSide: "bottom", targetSide: "top" });
  });

  it("target upper-left → source Left, target Right", () => {
    // centers: (600,550) → (100,450), dx=-500, dy=-100, angle ≈ -169°
    const result = pickHandleSides(box(500, 500), box(0, 400));
    expect(result).toEqual({ sourceSide: "left", targetSide: "right" });
  });
});

describe("getHandlePosition", () => {
  const b: Box = { x: 100, y: 200, width: 200, height: 100 };

  it("top → center-x, top-y", () => {
    expect(getHandlePosition(b, "top")).toEqual({ x: 200, y: 200 });
  });

  it("bottom → center-x, bottom-y", () => {
    expect(getHandlePosition(b, "bottom")).toEqual({ x: 200, y: 300 });
  });

  it("left → left-x, center-y", () => {
    expect(getHandlePosition(b, "left")).toEqual({ x: 100, y: 250 });
  });

  it("right → right-x, center-y", () => {
    expect(getHandlePosition(b, "right")).toEqual({ x: 300, y: 250 });
  });
});
