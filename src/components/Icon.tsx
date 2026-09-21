import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

// A tiny geometric icon set built entirely from React Native View primitives —
// no react-native-svg dependency (per CLAUDE.md §16). Each icon is a small
// composition of Views using border tricks and transforms.
//
// The goal is a calm, consistent silhouette style — filled shapes, no attempt
// at hairline stroke SVG fidelity. This keeps the visual language cohesive
// without pulling in a native icon library.
export type IconName =
  | 'home'
  | 'users'
  | 'person'
  | 'device'
  | 'lock'
  | 'gear'
  | 'radio'
  | 'chat'
  | 'map'
  | 'pin'
  | 'signal'
  | 'signalOff'
  | 'dot'
  | 'ring'
  | 'alert'
  | 'check'
  | 'shield'
  | 'shieldCheck'
  | 'plus'
  | 'chevronRight'
  | 'chevronLeft'
  | 'cloud'
  | 'trail'
  | 'satellite'
  | 'bell';

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly color: string;
}

export function Icon({
  name,
  size = 20,
  color,
}: IconProps): React.JSX.Element {
  switch (name) {
    case 'home':
      return <IconHome size={size} color={color} />;
    case 'users':
      return <IconUsers size={size} color={color} />;
    case 'person':
      return <IconPerson size={size} color={color} />;
    case 'device':
      return <IconDevice size={size} color={color} />;
    case 'lock':
      return <IconLock size={size} color={color} />;
    case 'gear':
      return <IconGear size={size} color={color} />;
    case 'radio':
      return <IconRadio size={size} color={color} />;
    case 'chat':
      return <IconChat size={size} color={color} />;
    case 'map':
      return <IconMap size={size} color={color} />;
    case 'pin':
      return <IconPin size={size} color={color} />;
    case 'signal':
      return <IconSignal size={size} color={color} />;
    case 'signalOff':
      return <IconSignal size={size} color={color} muted />;
    case 'dot':
      return <IconDot size={size} color={color} />;
    case 'ring':
      return <IconRing size={size} color={color} />;
    case 'alert':
      return <IconAlert size={size} color={color} />;
    case 'check':
      return <IconCheck size={size} color={color} />;
    case 'shield':
      return <IconShield size={size} color={color} />;
    case 'shieldCheck':
      return <IconShield size={size} color={color} withCheck />;
    case 'plus':
      return <IconPlus size={size} color={color} />;
    case 'chevronRight':
      return <IconChevron size={size} color={color} direction="right" />;
    case 'chevronLeft':
      return <IconChevron size={size} color={color} direction="left" />;
    case 'cloud':
      return <IconCloud size={size} color={color} />;
    case 'trail':
      return <IconTrail size={size} color={color} />;
    case 'satellite':
      return <IconRadio size={size} color={color} />;
    case 'bell':
      return <IconBell size={size} color={color} />;
  }
}

interface Base {
  size: number;
  color: string;
}

function frame(size: number): ViewStyle {
  return { width: size, height: size, alignItems: 'center', justifyContent: 'center' };
}

function IconHome({ size, color }: Base) {
  return (
    <View style={frame(size)}>
      <View style={styles.homeInner}>
        <View
          style={[
            styles.homeTriangle,
            {
              borderLeftWidth: size * 0.5,
              borderRightWidth: size * 0.5,
              borderBottomWidth: size * 0.48,
              borderBottomColor: color,
            },
          ]}
        />
        <View
          style={[
            styles.homeRoof,
            {
              width: size * 0.7,
              height: size * 0.4,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function IconUsers({ size, color }: Base) {
  const r = size * 0.2;
  return (
    <View style={[styles.usersRoot, { width: size, height: size }]}>
      <View
        style={[
          styles.usersHead,
          {
            top: size * 0.1,
            left: -size * 0.02,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.usersHead,
          {
            top: size * 0.1,
            right: -size * 0.02,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.usersBody,
          {
            top: size * 0.34,
            left: (size - r * 2.4) / 2,
            width: r * 2.4,
            height: r * 2.4,
            borderRadius: r * 1.2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

function IconPerson({ size, color }: Base) {
  const headR = size * 0.19;
  return (
    <View style={[styles.personRoot, { width: size, height: size }]}>
      <View
        style={{
          width: headR * 2,
          height: headR * 2,
          borderRadius: headR,
          backgroundColor: color,
          marginTop: size * 0.1,
        }}
      />
      <View
        style={{
          marginTop: size * 0.06,
          width: size * 0.75,
          height: size * 0.4,
          borderTopLeftRadius: size * 0.35,
          borderTopRightRadius: size * 0.35,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function IconDevice({ size, color }: Base) {
  return (
    <View style={frame(size)}>
      <View
        style={[
          styles.deviceCard,
          {
            width: size * 0.55,
            height: size * 0.85,
            borderRadius: size * 0.12,
            borderColor: color,
          },
        ]}
      >
        <View style={[styles.deviceBar, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function IconLock({ size, color }: Base) {
  return (
    <View style={[styles.lockRoot, { width: size, height: size }]}>
      <View
        style={[
          styles.lockShackle,
          {
            width: size * 0.5,
            height: size * 0.32,
            borderTopLeftRadius: size * 0.3,
            borderTopRightRadius: size * 0.3,
            borderColor: color,
            marginTop: size * 0.12,
          },
        ]}
      />
      <View
        style={[
          styles.lockBody,
          {
            width: size * 0.72,
            height: size * 0.42,
            borderRadius: size * 0.08,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

function IconGear({ size, color }: Base) {
  // Approximated gear: outer ring + 4 cardinal teeth + inner dot.
  const tickW = size * 0.14;
  const tickH = size * 0.16;
  return (
    <View style={frame(size)}>
      <View style={styles.gearContainer}>
        {[0, 90, 180, 270].map(deg => (
          <View
            key={deg}
            style={[
              styles.gearTooth,
              {
                width: tickW,
                height: tickH,
                backgroundColor: color,
                transform: [{ rotate: `${deg}deg` }, { translateY: -size * 0.42 }],
                top: size / 2 - tickH / 2,
                left: size / 2 - tickW / 2,
              },
            ]}
          />
        ))}
        <View
          style={[
            styles.gearOuterRing,
            {
              width: size * 0.68,
              height: size * 0.68,
              borderRadius: size * 0.34,
              borderColor: color,
            },
          ]}
        />
        <View
          style={[
            styles.gearInnerDot,
            {
              width: size * 0.2,
              height: size * 0.2,
              borderRadius: size * 0.1,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function IconRadio({ size, color }: Base) {
  return (
    <View style={[styles.radioRoot, { width: size, height: size }]}>
      <View
        style={[
          styles.radioRingOuter,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.radioRingMiddle,
          {
            width: size * 0.66,
            height: size * 0.66,
            borderRadius: size * 0.33,
            borderColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.radioCenter,
          {
            width: size * 0.28,
            height: size * 0.28,
            borderRadius: size * 0.14,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

function IconChat({ size, color }: Base) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size * 0.9,
          height: size * 0.7,
          borderRadius: size * 0.18,
          backgroundColor: color,
          marginTop: size * 0.05,
          marginLeft: size * 0.05,
        }}
      />
      <View
        style={[
          styles.chatTail,
          {
            bottom: size * 0.05,
            left: size * 0.22,
            borderTopColor: color,
          },
        ]}
      />
    </View>
  );
}

function IconMap({ size, color }: Base) {
  return (
    <View style={frame(size)}>
      <View
        style={[
          styles.mapBox,
          {
            width: size * 0.9,
            height: size * 0.75,
            borderColor: color,
          },
        ]}
      >
        <View style={[styles.mapCol, { borderColor: color }]} />
        <View style={[styles.mapCol, { borderColor: color }]} />
        <View style={styles.mapColLast} />
      </View>
    </View>
  );
}

function IconPin({ size, color }: Base) {
  return (
    <View style={[styles.pinRoot, { width: size, height: size }]}>
      <View
        style={[
          styles.pinHead,
          {
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size * 0.35,
            backgroundColor: color,
            marginTop: size * 0.02,
          },
        ]}
      >
        <View
          style={[
            styles.pinCutout,
            {
              width: size * 0.22,
              height: size * 0.22,
              borderRadius: size * 0.11,
            },
          ]}
        />
      </View>
      <View
        style={[
          styles.pinTail,
          {
            marginTop: -size * 0.12,
            borderLeftWidth: size * 0.14,
            borderRightWidth: size * 0.14,
            borderTopWidth: size * 0.24,
            borderTopColor: color,
          },
        ]}
      />
    </View>
  );
}

function IconSignal({ size, color, muted = false }: Base & { muted?: boolean }) {
  const bars = [0.3, 0.5, 0.7, 0.95];
  return (
    <View
      style={[
        styles.signalRoot,
        {
          width: size,
          height: size,
          paddingHorizontal: size * 0.05,
        },
      ]}
    >
      {bars.map((h, i) => (
        <View
          key={i}
          style={[
            styles.signalBar,
            {
              width: size * 0.18,
              height: size * h,
              backgroundColor: color,
            },
            muted && styles.signalBarMuted,
          ]}
        />
      ))}
      {muted ? (
        <View
          style={[
            styles.signalMutedLine,
            {
              width: size * 1.1,
              backgroundColor: color,
              top: size / 2,
              left: -size * 0.05,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

function IconDot({ size, color }: Base) {
  return (
    <View style={frame(size)}>
      <View
        style={{
          width: size * 0.55,
          height: size * 0.55,
          borderRadius: size * 0.28,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function IconRing({ size, color }: Base) {
  return (
    <View style={frame(size)}>
      <View
        style={[
          styles.ringShape,
          {
            width: size * 0.7,
            height: size * 0.7,
            borderRadius: size * 0.35,
            borderColor: color,
          },
        ]}
      />
    </View>
  );
}

function IconAlert({ size, color }: Base) {
  return (
    <View style={[styles.alertRoot, { width: size, height: size }]}>
      <View
        style={[
          styles.alertTriangle,
          {
            borderLeftWidth: size * 0.5,
            borderRightWidth: size * 0.5,
            borderBottomWidth: size * 0.85,
            borderBottomColor: color,
            marginTop: size * 0.05,
          },
        ]}
      />
      <View
        style={[
          styles.alertStem,
          {
            top: size * 0.35,
            height: size * 0.25,
          },
        ]}
      />
      <View
        style={[
          styles.alertDot,
          {
            top: size * 0.67,
          },
        ]}
      />
    </View>
  );
}

function IconCheck({ size, color }: Base) {
  return (
    <View style={frame(size)}>
      <View style={[styles.checkFrame, { width: size * 0.75, height: size * 0.55 }]}>
        <View
          style={[
            styles.checkStrokeLeft,
            {
              top: size * 0.22,
              width: size * 0.32,
              backgroundColor: color,
            },
          ]}
        />
        <View
          style={[
            styles.checkStrokeRight,
            {
              left: size * 0.2,
              top: size * 0.1,
              width: size * 0.5,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function IconShield({
  size,
  color,
  withCheck = false,
}: Base & { withCheck?: boolean }) {
  return (
    <View style={frame(size)}>
      <View
        style={[
          styles.shieldBody,
          {
            width: size * 0.8,
            height: size * 0.9,
            backgroundColor: color,
            borderTopLeftRadius: size * 0.18,
            borderTopRightRadius: size * 0.18,
            borderBottomLeftRadius: size * 0.4,
            borderBottomRightRadius: size * 0.4,
          },
        ]}
      >
        {withCheck ? (
          <View style={[styles.shieldCheckFrame, { width: size * 0.5, height: size * 0.4 }]}>
            <View
              style={[
                styles.shieldCheckLeft,
                {
                  top: size * 0.18,
                  width: size * 0.22,
                },
              ]}
            />
            <View
              style={[
                styles.shieldCheckRight,
                {
                  left: size * 0.14,
                  top: size * 0.08,
                  width: size * 0.36,
                },
              ]}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function IconPlus({ size, color }: Base) {
  return (
    <View style={frame(size)}>
      <View
        style={[
          styles.plusHorizontal,
          {
            width: size * 0.65,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.plusVertical,
          {
            height: size * 0.65,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

function IconChevron({
  size,
  color,
  direction,
}: Base & { direction: 'left' | 'right' }) {
  const rotate = direction === 'right' ? '45deg' : '-135deg';
  return (
    <View style={frame(size)}>
      <View
        style={[
          styles.chevronShape,
          {
            width: size * 0.4,
            height: size * 0.4,
            borderColor: color,
            transform: [{ rotate }],
          },
        ]}
      />
    </View>
  );
}

function IconCloud({ size, color }: Base) {
  return (
    <View style={frame(size)}>
      <View style={[styles.cloudFrame, { width: size, height: size * 0.7 }]}>
        <View
          style={[
            styles.cloudPuff,
            {
              left: size * 0.05,
              top: size * 0.18,
              width: size * 0.4,
              height: size * 0.4,
              borderRadius: size * 0.2,
              backgroundColor: color,
            },
          ]}
        />
        <View
          style={[
            styles.cloudPuff,
            {
              left: size * 0.3,
              top: size * 0.04,
              width: size * 0.5,
              height: size * 0.5,
              borderRadius: size * 0.25,
              backgroundColor: color,
            },
          ]}
        />
        <View
          style={[
            styles.cloudPuff,
            {
              right: size * 0.05,
              top: size * 0.22,
              width: size * 0.35,
              height: size * 0.35,
              borderRadius: size * 0.175,
              backgroundColor: color,
            },
          ]}
        />
        <View
          style={[
            styles.cloudBase,
            {
              left: size * 0.1,
              width: size * 0.8,
              height: size * 0.25,
              borderBottomLeftRadius: size * 0.1,
              borderBottomRightRadius: size * 0.1,
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

function IconTrail({ size, color }: Base) {
  // Two dots + a curved path — evokes route / movement / a line between people.
  return (
    <View style={frame(size)}>
      <View
        style={[
          styles.trailDot,
          {
            top: size * 0.15,
            left: size * 0.15,
            width: size * 0.22,
            height: size * 0.22,
            borderRadius: size * 0.11,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.trailDot,
          {
            bottom: size * 0.15,
            right: size * 0.15,
            width: size * 0.22,
            height: size * 0.22,
            borderRadius: size * 0.11,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.trailCurve,
          {
            top: size * 0.28,
            left: size * 0.28,
            width: size * 0.5,
            height: size * 0.5,
            borderRadius: size * 0.25,
            borderColor: color,
          },
        ]}
      />
    </View>
  );
}

function IconBell({ size, color }: Base) {
  return (
    <View style={[styles.bellRoot, { width: size, height: size }]}>
      <View
        style={{
          width: size * 0.14,
          height: size * 0.08,
          borderRadius: size * 0.04,
          backgroundColor: color,
          marginTop: size * 0.06,
        }}
      />
      <View
        style={{
          width: size * 0.7,
          height: size * 0.55,
          borderTopLeftRadius: size * 0.35,
          borderTopRightRadius: size * 0.35,
          backgroundColor: color,
          marginTop: -size * 0.02,
        }}
      />
      <View
        style={[
          styles.bellFlare,
          {
            width: size * 0.86,
            height: size * 0.06,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.bellClapper,
          {
            width: size * 0.16,
            height: size * 0.1,
            borderBottomLeftRadius: size * 0.08,
            borderBottomRightRadius: size * 0.08,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const CUTOUT = '#07090B';

const styles = StyleSheet.create({
  // Home
  homeInner: {
    alignItems: 'center',
  },
  homeTriangle: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  homeRoof: {
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    marginTop: -1,
  },

  // Users
  usersRoot: {
    position: 'relative',
  },
  usersHead: {
    position: 'absolute',
    opacity: 0.6,
  },
  usersBody: {
    position: 'absolute',
  },

  // Person
  personRoot: {
    alignItems: 'center',
  },

  // Device
  deviceCard: {
    borderWidth: 2,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  deviceBar: {
    width: 6,
    height: 2,
    borderRadius: 1,
    marginBottom: 1,
  },

  // Lock
  lockRoot: {
    alignItems: 'center',
  },
  lockShackle: {
    borderWidth: 2,
    borderBottomWidth: 0,
  },
  lockBody: {
    marginTop: 1,
  },

  // Gear
  gearContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gearTooth: {
    position: 'absolute',
    borderRadius: 1,
  },
  gearOuterRing: {
    borderWidth: 2.5,
  },
  gearInnerDot: {
    position: 'absolute',
  },

  // Radio
  radioRoot: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  radioRingOuter: {
    position: 'absolute',
    bottom: 0,
    borderWidth: 2,
    opacity: 0.25,
  },
  radioRingMiddle: {
    position: 'absolute',
    bottom: 0,
    borderWidth: 2,
    opacity: 0.55,
  },
  radioCenter: {
    position: 'absolute',
    bottom: 0,
  },

  // Chat
  chatTail: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  // Map
  mapBox: {
    borderWidth: 2,
    borderRadius: 3,
    flexDirection: 'row',
  },
  mapCol: {
    flex: 1,
    borderRightWidth: 1,
  },
  mapColLast: {
    flex: 1,
  },

  // Pin
  pinRoot: {
    alignItems: 'center',
  },
  pinHead: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCutout: {
    backgroundColor: CUTOUT,
  },
  pinTail: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  // Signal
  signalRoot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  signalBar: {
    borderRadius: 1,
  },
  signalBarMuted: {
    opacity: 0.25,
  },
  signalMutedLine: {
    position: 'absolute',
    height: 2,
    transform: [{ rotate: '-30deg' }],
  },

  // Ring
  ringShape: {
    borderWidth: 2,
  },

  // Alert
  alertRoot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTriangle: {
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  alertStem: {
    position: 'absolute',
    width: 2.5,
    backgroundColor: CUTOUT,
    borderRadius: 1,
  },
  alertDot: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: CUTOUT,
  },

  // Check
  checkFrame: {
    position: 'relative',
  },
  checkStrokeLeft: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    transform: [{ rotate: '45deg' }],
  },
  checkStrokeRight: {
    position: 'absolute',
    height: 3,
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }],
  },

  // Shield
  shieldBody: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shieldCheckFrame: {
    position: 'relative',
  },
  shieldCheckLeft: {
    position: 'absolute',
    left: 0,
    height: 2.5,
    backgroundColor: CUTOUT,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  shieldCheckRight: {
    position: 'absolute',
    height: 2.5,
    backgroundColor: CUTOUT,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },

  // Plus
  plusHorizontal: {
    position: 'absolute',
    height: 2.5,
    borderRadius: 2,
  },
  plusVertical: {
    position: 'absolute',
    width: 2.5,
    borderRadius: 2,
  },

  // Chevron
  chevronShape: {
    borderRightWidth: 2.5,
    borderTopWidth: 2.5,
  },

  // Cloud
  cloudFrame: {
    position: 'relative',
  },
  cloudPuff: {
    position: 'absolute',
  },
  cloudBase: {
    position: 'absolute',
    bottom: 0,
  },

  // Trail
  trailDot: {
    position: 'absolute',
  },
  trailCurve: {
    position: 'absolute',
    borderWidth: 2,
    borderTopColor: 'transparent',
    borderLeftColor: 'transparent',
    opacity: 0.7,
  },

  // Bell
  bellRoot: {
    alignItems: 'center',
  },
  bellFlare: {
    borderRadius: 1,
  },
  bellClapper: {
    marginTop: 1,
  },
});
