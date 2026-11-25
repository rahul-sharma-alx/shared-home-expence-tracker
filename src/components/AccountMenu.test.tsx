// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

afterEach(cleanup);

describe("AccountMenu", () => {
  it("shows a provided profile image and falls back to the user's initial", () => {
    const { container, rerender } = render(
      <AccountMenu
        displayName="Roommate"
        email={null}
        photoUrl="https://lh3.googleusercontent.com/avatar.png"
        onOpenProfile={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    expect(container.querySelector("img")).toBeInTheDocument();

    rerender(
      <AccountMenu
        displayName="Roommate"
        email={null}
        photoUrl={null}
        onOpenProfile={vi.fn()}
        onSignOut={vi.fn()}
      />,
    );

    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
  });

  it("opens the account options and calls the profile action", () => {
    const onOpenProfile = vi.fn();
    const onSignOut = vi.fn();

    render(
      <AccountMenu
        displayName="Roommate"
        email="roommate@example.com"
        photoUrl={null}
        onOpenProfile={onOpenProfile}
        onSignOut={onSignOut}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    expect(screen.getByRole("group", { name: "Account options" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));

    expect(onOpenProfile).toHaveBeenCalledOnce();
    expect(onSignOut).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Account options" })).not.toBeInTheDocument();
  });

  it("calls sign out from the account options", () => {
    const onSignOut = vi.fn();

    render(
      <AccountMenu
        displayName="Roommate"
        email={null}
        photoUrl={null}
        onOpenProfile={vi.fn()}
        onSignOut={onSignOut}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalledOnce();
  });
});
