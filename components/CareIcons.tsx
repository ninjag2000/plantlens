import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Ellipse } from 'react-native-svg';

/**
 * Иконка горшка с росточком по референсу: горшок с ободком, стебель, два овальных листа.
 */
export const PottedPlantIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
    <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
            {/* Горшок: трапеция, шире сверху */}
            <Path d="M5 14h14l-2 8H7L5 14z" fill={color} />
            {/* Ободок горшка */}
            <Path d="M4 12h16l-1 2H5l-1-2z" fill={color} />
            {/* Стебель */}
            <Path d="M11 8h2v6h-2z" fill={color} />
            {/* Левый лист */}
            <Ellipse cx={8} cy={5} rx={3} ry={4.2} fill={color} transform="rotate(-25 8 5)" />
            {/* Правый лист */}
            <Ellipse cx={16} cy={5} rx={3} ry={4.2} fill={color} transform="rotate(25 16 5)" />
        </Svg>
    </View>
);
