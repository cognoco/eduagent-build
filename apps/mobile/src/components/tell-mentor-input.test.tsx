import { render, screen } from '@testing-library/react-native';
import { TellMentorInput } from './tell-mentor-input';

const BASE_PROPS = {
  value: '',
  onChangeText: jest.fn(),
  onSubmit: jest.fn(),
};

describe('TellMentorInput', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<TellMentorInput {...BASE_PROPS} />);
    expect(toJSON()).toBeTruthy();
  });

  it('TextInput has testID and accessibilityLabel', () => {
    render(<TellMentorInput {...BASE_PROPS} />);
    const input = screen.getByTestId('tell-mentor-input-field');
    expect(input).toBeTruthy();
    expect(input.props.accessibilityLabel).toBeTruthy();
  });

  it('submit Pressable has testID', () => {
    render(<TellMentorInput {...BASE_PROPS} />);
    const btn = screen.getByTestId('tell-mentor-submit');
    expect(btn).toBeTruthy();
  });

  it('submit Pressable has accessibilityRole="button"', () => {
    render(<TellMentorInput {...BASE_PROPS} />);
    const btn = screen.getByTestId('tell-mentor-submit');
    expect(btn.props.accessibilityRole).toBe('button');
  });

  it('uses adult/neutral copy when birthYear is null (bug 173: not adolescent)', () => {
    render(
      <TellMentorInput {...BASE_PROPS} audience="learner" birthYear={null} />,
    );
    // Adult copy title
    screen.getByText('Add a Note for Your Mentor');
  });

  it('uses adult copy when birthYear is undefined', () => {
    render(
      <TellMentorInput
        {...BASE_PROPS}
        audience="learner"
        birthYear={undefined}
      />,
    );
    screen.getByText('Add a Note for Your Mentor');
  });

  it('uses adolescent copy when birthYear gives age 15', () => {
    const adolescentYear = new Date().getFullYear() - 15;
    render(
      <TellMentorInput
        {...BASE_PROPS}
        audience="learner"
        birthYear={adolescentYear}
      />,
    );
    screen.getByText('Tell Your Mentor Something');
  });

  it('uses parent copy when audience is parent', () => {
    render(
      <TellMentorInput {...BASE_PROPS} audience="parent" childName="Emma" />,
    );
    screen.getByText('Tell the Mentor');
    screen.getByText(
      'Add something important for the mentor to remember about Emma.',
    );
  });
});
